/** 资源入口与子页说明共用，名称和说明在此维护。 */
export const RESOURCE_GROUPS = [
  {
    title: "数据资源",
    description: "管理街区数据与评价依据",
    entries: [
      {
        href: "/resources/poi",
        icon: "location_on",
        title: "POI 管理",
        description: "导入高德 / 大众点评数据，管理街区 POI 事实层",
      },
      {
        href: "/resources/profiles",
        icon: "insights",
        title: "街巷画像",
        description: "由 POI 生成画像，预览评分时使用的街区事实",
      },
      {
        href: "/resources/annotations",
        icon: "photo_library",
        title: "人工标注库",
        description: "导入标注街景图与属性，照片点评时匹配赋值",
      },
    ],
  },
  {
    title: "分析配置",
    description: "维护指标、提示词与分析流程",
    entries: [
      {
        href: "/resources/metrics",
        icon: "account_tree",
        title: "指标体系",
        description: "维度与指标权重，模板版本管理",
      },
      {
        href: "/resources/prompts",
        icon: "terminal",
        title: "Prompt 管理",
        description: "识别、评分、报告各阶段的提示词与历史版本",
      },
      {
        href: "/resources/analysis",
        icon: "tune",
        title: "分析管理",
        description: "结果页展示区块与点评流程开关",
      },
    ],
  },
] as const;

export const RESOURCE_ENTRIES = RESOURCE_GROUPS.flatMap(
  (group) => [...group.entries],
);
