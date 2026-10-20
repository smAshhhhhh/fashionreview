/* 品牌字标：颜色走主题 token，副标题用 HTML 文本以保证小尺寸可读 */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <svg
        role="img"
        aria-label="Fashion Street AI"
        viewBox="12 28 473 56"
        preserveAspectRatio="xMinYMid meet"
        className="block w-full max-w-48 h-auto text-brand"
      >
        <title>Fashion Street AI</title>
        <text
          y="76"
          fontFamily="Arial, 'Helvetica Neue', sans-serif"
          fontStyle="italic"
          fontSize="58"
          className="fill-current"
        >
          <tspan x="20" fontWeight="800" letterSpacing="-3.2">
            Fashion
          </tspan>
          <tspan x="232" fontWeight="300" letterSpacing="-2.6">
            Street
          </tspan>
          <tspan x="408" fontWeight="900" letterSpacing="-2.5" className="fill-primary">
            AI
          </tspan>
        </text>
      </svg>
      <span className="text-[9px] font-semibold tracking-[0.15em] text-brand whitespace-nowrap">
        STYLE MEETS INTELLIGENCE
      </span>
    </div>
  );
}
