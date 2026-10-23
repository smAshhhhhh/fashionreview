/** 资源管理请求：限制等待时间，不自动重试写操作，不将代理页或堆栈输出到界面。 */
export async function resourceFetch(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<Response> {
  const mutation = !["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase());
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs ?? (mutation ? 120_000 : 15_000));
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      const status = response.status;
      let message = status === 401 ? "访问凭证已失效，请重新登录后重试。"
        : status === 403 ? "当前没有执行此操作的权限。"
        : status === 404 ? "未找到这条记录，请重新加载列表。"
        : status === 409 ? "数据状态已改变或记录正在使用，请重新加载后核对。"
        : status === 413 ? "文件过大，请缩小文件后重试。"
        : status === 415 ? "文件格式不受支持，请核对后重试。"
        : status === 429 ? "请求过于频繁，请稍后重试。"
        : status === 400 || status === 422 ? "提交内容不符合要求，请检查输入和文件格式后重试。"
        : mutation ? "服务暂时异常，操作结果尚未确认，请先重新加载核对，避免重复提交。"
        : "服务暂时无法加载数据，请稍后重试。";
      // 仅保留指标权重验证的结构化业务说明，不展示任意后端响应。
      if (status === 422 && /\/metric-templates\/\d+\/tree/.test(url)) {
        try {
          const detail = JSON.parse(body).detail;
          if (typeof detail?.message === "string" && Array.isArray(detail.errors)) {
            message = [detail.message, ...detail.errors.filter((value: unknown) => typeof value === "string")].join("；").slice(0, 1200);
          }
        } catch { /* 使用默认说明 */ }
      }
      throw new ResourceHttpError(`${message}（${status}）`);
    }
    if (response.status === 204) return new Response(null, { status: 204 });
    // 在超时边界内完成正文读取和验证，避免页面永久等待。
    JSON.parse(body);
    return new Response(body, { status: response.status, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    if (error instanceof ResourceHttpError) throw error;
    if (init.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    throw new Error(mutation ? "连接中断，操作结果尚未确认，请先重新加载核对，避免重复提交。" : timedOut ? "加载超时，请检查网络后重新加载。" : "暂时无法加载数据，请检查网络后重新加载。");
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

class ResourceHttpError extends Error {}
