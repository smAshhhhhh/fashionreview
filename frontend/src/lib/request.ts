export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ApiRequestError extends Error {
  readonly status?: number;
  readonly outcomeUnknown: boolean;

  constructor(message: string, options: { status?: number; outcomeUnknown?: boolean } = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.outcomeUnknown = options.outcomeUnknown ?? false;
  }
}

function statusMessage(status: number): string {
  switch (status) {
    case 400:
    case 422:
      return "输入内容有误，请检查街巷名称或图片后重试。";
    case 401:
      return "当前无法验证访问权限，请稍后重试。";
    case 403:
      return "当前没有执行此操作的权限。";
    case 404:
      return "未找到所请求的记录，可能已被移除。";
    case 413:
      return "图片过大，请选择不超过 10 MB 的图片。";
    case 415:
      return "图片格式不受支持，请使用 JPEG、PNG 或 WebP。";
    case 429:
      return "请求过于频繁，请稍候再试。";
    default:
      return "服务暂时无法完成请求，请稍后再试。";
  }
}

/** Bound both the response and body read. Mutations are never retried automatically. */
export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const mutation = !["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase());
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? (mutation ? 30_000 : 10_000));

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new ApiRequestError(statusMessage(response.status), {
        status: response.status,
        outcomeUnknown: mutation && response.status >= 500,
      });
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (options.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    throw new ApiRequestError(
      mutation
        ? "暂时无法确认是否已创建评价，请先核对历史记录，避免重复提交。"
        : timedOut
          ? "请求等待超时，请检查网络后重试。"
          : "暂时无法加载数据，请检查网络后重试。",
      { outcomeUnknown: mutation },
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
