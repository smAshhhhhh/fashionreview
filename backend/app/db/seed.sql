-- 评分模板种子数据：5 一级 / 25 二级 / 75 三级，等权
-- 三级权重 1/3≈0.3333，二级/一级权重 1/5=0.2000
SET NAMES utf8mb4;

-- 指标体系模板（版本）。模板一为默认启用模板；
-- 下方维度/指标行未显式给 template_id，由列 DEFAULT 1 归属模板一。
INSERT INTO metric_template (id, name, description, is_active, sort_no) VALUES (1, '模板一', '默认指标体系：空间美学 / 商业业态 / 文化体验 / 活力人气 / 传播影响', 1, 1);

-- 一级维度
INSERT INTO fashion_dimension (id, code, name, weight, sort_no) VALUES (1, 'SPACE', '空间美学', 0.2000, 1);
INSERT INTO fashion_dimension (id, code, name, weight, sort_no) VALUES (2, 'BUSINESS', '商业业态', 0.2000, 2);
INSERT INTO fashion_dimension (id, code, name, weight, sort_no) VALUES (3, 'CULTURE', '文化体验', 0.2000, 3);
INSERT INTO fashion_dimension (id, code, name, weight, sort_no) VALUES (4, 'VITALITY', '活力人气', 0.2000, 4);
INSERT INTO fashion_dimension (id, code, name, weight, sort_no) VALUES (5, 'INFLUENCE', '传播影响', 0.2000, 5);

-- 二级维度
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (1, 1, 'SPACE_S1', '宏观印象-天际线与街廓形态', 0.2000, 1);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (2, 1, 'SPACE_S2', '视觉主体-建筑立面与细部表情', 0.2000, 2);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (3, 1, 'SPACE_S3', '街巷灰空间-底层空间与设计渗透', 0.2000, 3);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (4, 1, 'SPACE_S4', '脚下细节-地面与基础设施', 0.2000, 4);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (5, 1, 'SPACE_S5', '氛围点缀-绿化与软装', 0.2000, 5);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (6, 2, 'BUSINESS_S1', '吸引力核心-品牌能级与独特性', 0.2000, 1);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (7, 2, 'BUSINESS_S2', '内容生态-业态构成与丰富度', 0.2000, 2);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (8, 2, 'BUSINESS_S3', '适配度-品牌调性与街巷气质', 0.2000, 3);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (9, 2, 'BUSINESS_S4', '沉浸感-空间体验与消费场景', 0.2000, 4);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (10, 2, 'BUSINESS_S5', '生命力-经营活力与更新率', 0.2000, 5);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (11, 3, 'CULTURE_S1', '文化厚度-历史基因的留存与表达', 0.2000, 1);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (12, 3, 'CULTURE_S2', '传统重生-非遗与在地手艺的活化', 0.2000, 2);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (13, 3, 'CULTURE_S3', '生活温度-社区记忆与公共生活', 0.2000, 3);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (14, 3, 'CULTURE_S4', '流动盛宴-文化活动频次与品质', 0.2000, 4);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (15, 3, 'CULTURE_S5', '场景感染力-空间叙事的独特性', 0.2000, 5);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (16, 4, 'VITALITY_S1', '热度基数-人群密度与流量', 0.2000, 1);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (17, 4, 'VITALITY_S2', '活动质量-人群画像与颜值', 0.2000, 2);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (18, 4, 'VITALITY_S3', '深度参与-行为互动与停留', 0.2000, 3);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (19, 4, 'VITALITY_S4', '持续能力-时空分布均匀度', 0.2000, 4);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (20, 4, 'VITALITY_S5', '感官活力-声音与氛围', 0.2000, 5);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (21, 5, 'INFLUENCE_S1', '数据广度-线上声量与热度', 0.2000, 1);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (22, 5, 'INFLUENCE_S2', '内容质感-视觉传播力与出片率', 0.2000, 2);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (23, 5, 'INFLUENCE_S3', '传播深度-话题性与故事感', 0.2000, 3);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (24, 5, 'INFLUENCE_S4', '传播广度-用户参与度与互动性', 0.2000, 4);
INSERT INTO fashion_sub_dimension (id, dimension_id, code, name, weight, sort_no) VALUES (25, 5, 'INFLUENCE_S5', '权威背书-专业认可与媒体曝光', 0.2000, 5);

-- 三级指标
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (1, 1, 'SPACE_S1_M1', '建筑高低感', '坡屋顶、女儿墙、钟楼，艺术装置', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (2, 1, 'SPACE_S1_M2', '街巷宽高比', '街宽D/建筑高度H——越大越冷清，越小越局促，1：1视觉亲切舒适', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (3, 1, 'SPACE_S1_M3', '视廊净化度', '是否有架空线', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (4, 2, 'SPACE_S2_M1', '材料质感', '红砖、水洗石、原木、质感涂料，仿石贴面、玻璃幕墙', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (5, 2, 'SPACE_S2_M2', '色彩控制力', '统一底色，主色调的和谐度+点缀色（店招、雨棚）跳跃度', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (6, 2, 'SPACE_S2_M3', '通透性', '窗墙比，越高越通透', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (7, 3, 'SPACE_S3_M1', '外摆区品质', '外摆是否占盲道，桌椅、花车、遮阳伞的统一与风格', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (8, 3, 'SPACE_S3_M2', '橱窗叙事性', '主题，更换，非营业时间的灯光', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (9, 3, 'SPACE_S3_M3', '店招独创性', '个性化程度', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (10, 4, 'SPACE_S4_M1', '铺装精致化', '透水铺装，拼花引流，井盖装饰', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (11, 4, 'SPACE_S4_M2', '街巷家具集成度', '统一的路灯、垃圾桶、座椅', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (12, 4, 'SPACE_S4_M3', '无障碍细节', '路缘、坡道的高低处理', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (13, 5, 'SPACE_S5_M1', '绿植搭配', '窗台、墙面的垂直绿化', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (14, 5, 'SPACE_S5_M2', '花箱容器设计', '花箱容器是否于街巷风格匹配', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (15, 5, 'SPACE_S5_M3', '光影与夜景照明', '凸显建筑细节，招牌灯箱是否刺目', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (16, 6, 'BUSINESS_S1_M1', '首店/旗舰店密度', '是否拥有城市首店、区域首店，知名品牌旗舰店', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (17, 6, 'BUSINESS_S1_M2', '主理人品牌比例', '量化独立设计师、主理人创立的非标品牌占比，它是街巷时尚度的灵魂', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (18, 6, 'BUSINESS_S1_M3', '连锁品牌在地化程度', '观察链锁品牌门店的定制化改造', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (19, 7, 'BUSINESS_S2_M1', '零售与非零售比例', '购物店铺与体验店铺（餐饮、咖啡馆、画廊、手工坊）的比例，黄金比例50%', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (20, 7, 'BUSINESS_S2_M2', '业态相关性', '业态联动性越高，延长客人停留时间越长', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (21, 7, 'BUSINESS_S2_M3', '非标业态的丰富度', '如独立插画师工作 室、香氛调香室、vintage古着店、自行车定制店等', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (22, 8, 'BUSINESS_S3_M1', '客单价匹配度', '观察主力店铺的客单价与街区整体定位一致性', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (23, 8, 'BUSINESS_S3_M2', '审美风格和谐性', '店铺门头设计和装修风格与街巷历史肌理或主题风格是否相互呼应', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (24, 8, 'BUSINESS_S3_M3', '目标客群重合度', '是否存在人群断层', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (25, 9, 'BUSINESS_S4_M1', '店铺停留空间', '统计店铺内外是否提供可供坐下休息、交谈空间', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (26, 9, 'BUSINESS_S4_M2', '外摆区的渗透度', '通过外摆、开窗等方式将经营活动延伸至公共空间', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (27, 9, 'BUSINESS_S4_M3', '复合业态占比', '咖啡馆+买手店或书店+酒吧等复合经营模式', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (28, 10, 'BUSINESS_S5_M1', '店铺更新率', '保持一定的店铺淘汰率', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (29, 10, 'BUSINESS_S5_M2', '主理人的驻店率', '主理人是否常在店内', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (30, 10, 'BUSINESS_S5_M3', '夜间经济的延续性', '晚间（22点后）营业占比和形态，如酒吧、深夜食堂、夜间展览等', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (31, 11, 'CULTURE_S1_M1', '历史建筑/肌理的保留度', '老建筑、古树、古井、特色里弄肌理的留存比例，“微改造”让新旧并存', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (32, 11, 'CULTURE_S1_M2', '在地材料的运用', '修旧如旧是历史质感的重要来源', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (33, 11, 'CULTURE_S1_M3', '历史信息解说系统', '历史变迁的铭牌、导览板或数字化导览是文化体验的第一步', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (34, 12, 'CULTURE_S2_M1', '传统工艺的现代表达', '是否存在非遗技艺与现代设计结合的产品或店铺', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (35, 12, 'CULTURE_S2_M2', '手工艺的现场互动', '是否开设开放式的工坊或体验区', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (36, 12, 'CULTURE_S2_M3', '在地食材/小吃的传承', '是否保留传统做法+包装形式的年轻化', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (37, 13, 'CULTURE_S3_M1', '原住民的保留度', '是否有本地居民居住，如晾晒、交谈等生活痕迹', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (38, 13, 'CULTURE_S3_M2', '公共交往空间的使用率', '街角空地、大树下座椅、社区广场，是否有本地人聊天、下棋、带小孩、遛狗等', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (39, 13, 'CULTURE_S3_M3', '社区功能的混合度', '是否有便民服务点。如钥匙铺、修鞋摊、改衣店、老式理发店等', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (40, 14, 'CULTURE_S4_M1', '主题市集的举办频率', '每月/每季举办的市集次数，以及市集内容与街巷调性的匹配度', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (41, 14, 'CULTURE_S4_M2', '艺术展览与快闪密度', '街头巷尾有无小型画廊或定期展览或快闪装置', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (42, 14, 'CULTURE_S4_M3', '街头表演与音乐氛围', '是否有街头艺人表演或店铺播放音乐与街巷氛围是否协调', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (43, 15, 'CULTURE_S5_M1', '标志性的文化IP符号', '有无代表街巷的文化符号，如一只猫、一棵树、一个传说，并巧妙融入导视系统或文创产品', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (44, 15, 'CULTURE_S5_M2', '五感体验的营造', '除了视觉，街巷是否有独特的声音、气味和触觉', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (45, 15, 'CULTURE_S5_M3', '夜间的文化场景', '是否有深夜书房、夜间博物馆、实验情景剧', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (46, 16, 'VITALITY_S1_M1', '高峰时段人流密度', '周末或工作日黄金时段的单位面积客流量', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (47, 16, 'VITALITY_S1_M2', '全域客流均匀度', '主街与支巷的人流', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (48, 16, 'VITALITY_S1_M3', '外来与本地客群比', '通过车牌、口音、旅行团旗帜估算', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (49, 17, 'VITALITY_S2_M1', '年轻人占比', '15~35岁客群', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (50, 17, 'VITALITY_S2_M2', '潮流浓度的自发性', '路人穿着打扮，如汉服、古着、先锋设计', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (51, 17, 'VITALITY_S2_M3', '家庭客群与宠物友好度', '统计推婴儿车、遛狗人群数量', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (52, 18, 'VITALITY_S3_M1', '坐得下来的人', '统计公共座椅、台阶、外摆的坐着人数', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (53, 18, 'VITALITY_S3_M2', '拍个不停的人', '统计拍照路人比例', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (54, 18, 'VITALITY_S3_M3', '消费与等待行为', '店铺门前排队情况', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (55, 19, 'VITALITY_S4_M1', '全天活力曲线', '分时段观察', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (56, 19, 'VITALITY_S4_M2', '全年淡旺季波动', '重点观察夏季和冬季', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (57, 19, 'VITALITY_S4_M3', '非高峰期的留客能力', '上午10点到下午2点的传统低谷期', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (58, 20, 'VITALITY_S5_M1', '声音的丰富度', '杯碟碰撞声、音乐声、交谈声、嬉笑声', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (59, 20, 'VITALITY_S5_M2', '背景音乐的在场感', '是否协调', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (60, 20, 'VITALITY_S5_M3', '光与影的人气暗示', '光影与人影', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (61, 21, 'INFLUENCE_S1_M1', '社交媒体打卡量', '在小红书、抖音、大众点评、Instagram等平台，搜索街巷名称，统计相关笔记、帖子、视频的数量', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (62, 21, 'INFLUENCE_S1_M2', '话题标签传播力', '是否有专属的、被广泛使用的话题标签。统计该标签下的浏览量、参与人数，及是否形成独特的标签文化', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (63, 21, 'INFLUENCE_S1_M3', '搜索指数的趋势', '百度指数、微信指数等工具，查看街巷名称的搜索热度变化曲线', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (64, 22, 'INFLUENCE_S2_M1', '标志性打卡点', '街区内公认的“必拍”机位数量', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (65, 22, 'INFLUENCE_S2_M2', '用户生成内容的质量', '观察网友自发拍摄的照片/视频的构图、滤镜和剪辑水平', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (66, 22, 'INFLUENCE_S2_M3', '素人变网红的可能性', '评估普通人随手一拍是否能出片', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (67, 23, 'INFLUENCE_S3_M1', '独特的传播标签', '观察是否有广为流传的街区昵称（如“上海的小欧洲”），或者是否有专属的传播概念（如“最美梧桐路”）', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (68, 23, 'INFLUENCE_S3_M2', '热点事件的孕育能力', '是否定期产生在本地甚至全国范围引发讨论的热点事件', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (69, 23, 'INFLUENCE_S3_M3', '名人/达人到访率', '通过打卡记录，估算网红博主、达人、明星等到访的频率', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (70, 24, 'INFLUENCE_S4_M1', '打卡挑战赛的参与度', '观察是否有用户自发组织的拍照姿势挑战、盖章打卡活动，以及这些活动的参与人数', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (71, 24, 'INFLUENCE_S4_M2', '二次创作比例', '是否有用户进行深度创作，如制作街区Vlog、手绘地图、探店攻略合集等', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (72, 24, 'INFLUENCE_S4_M3', '口碑推荐意愿', '通过随机采访，了解游客是否愿意主动向朋友推荐这条街', 0.3333, 3);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (73, 25, 'INFLUENCE_S5_M1', '主流媒体曝光频次', '统计被权威媒体（如电视台、主流报刊、知名杂志）报道次数，以及报道角度（新闻事件或生活方式）', 0.3333, 1);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (74, 25, 'INFLUENCE_S5_M2', '行业奖项与认证', '查询是否获得过设计类、城市更新类、旅游类奖项', 0.3333, 2);
INSERT INTO fashion_metric (id, sub_dimension_id, code, name, metric_desc, weight, sort_no) VALUES (75, 25, 'INFLUENCE_S5_M3', '学术研究/出版物引用', '观察是否有建筑、城市规划、社会学等领域的学者将街区作为研究案例', 0.3333, 3);

-- ============ AI Prompt 模板初始数据（7 条）============
INSERT INTO ai_prompt_template (id, stage, dim_code, name, system_prompt, user_template, placeholders, version) VALUES (1, 'recognize', NULL, '街巷识别', '你是一名中国城市街区识别专家。根据用户输入，判断其指向的街巷/街区。只返回 JSON，不要多余文字。', '用户输入：{content}{city_hint}

请识别并返回如下 JSON：
{{
  "streetName": "规范的街巷名称，如 南京东路",
  "city": "所属城市，如 上海，未知填 null",
  "district": "所属行政区，如 黄浦区，未知填 null",
  "confidence": 0~1 的置信度数字
}}', '{content}=用户输入；{city_hint}=城市线索(可空)', 1);
INSERT INTO ai_prompt_template (id, stage, dim_code, name, system_prompt, user_template, placeholders, version) VALUES (2, 'score', 'SPACE', '评分-空间美学', '你是一名资深的城市街区时尚度评价专家。你将依据给定的评价指标，对一条街区逐项打分。评分为整数，取值 1~5：5=极高，4=较高，3=一般，2=较低，1=极低。请基于常识与所给事实客观判断，对每个指标给出分数与简短理由。只返回 JSON，不要多余文字。', '待评价街区：{street_name}
当前评价维度：{dim_name}

【街区事实】
{facts}

【本批需打分的指标（共 {metric_count} 项）】
{metrics_block}

请对以上每个指标打分，返回如下 JSON：
{{
  "scores": [
    {{"code": "指标code", "score": 1到5的整数, "reason": "简短理由"}}
  ]
}}
注意：scores 必须覆盖本批全部指标，code 必须与上面给出的完全一致。', '{street_name} {dim_name} {facts} {metric_count} {metrics_block}', 1);
INSERT INTO ai_prompt_template (id, stage, dim_code, name, system_prompt, user_template, placeholders, version) VALUES (3, 'score', 'BUSINESS', '评分-商业业态', '你是一名资深的城市街区时尚度评价专家。你将依据给定的评价指标，对一条街区逐项打分。评分为整数，取值 1~5：5=极高，4=较高，3=一般，2=较低，1=极低。请基于常识与所给事实客观判断，对每个指标给出分数与简短理由。只返回 JSON，不要多余文字。', '待评价街区：{street_name}
当前评价维度：{dim_name}

【街区事实】
{facts}

【本批需打分的指标（共 {metric_count} 项）】
{metrics_block}

请对以上每个指标打分，返回如下 JSON：
{{
  "scores": [
    {{"code": "指标code", "score": 1到5的整数, "reason": "简短理由"}}
  ]
}}
注意：scores 必须覆盖本批全部指标，code 必须与上面给出的完全一致。', '{street_name} {dim_name} {facts} {metric_count} {metrics_block}', 1);
INSERT INTO ai_prompt_template (id, stage, dim_code, name, system_prompt, user_template, placeholders, version) VALUES (4, 'score', 'CULTURE', '评分-文化体验', '你是一名资深的城市街区时尚度评价专家。你将依据给定的评价指标，对一条街区逐项打分。评分为整数，取值 1~5：5=极高，4=较高，3=一般，2=较低，1=极低。请基于常识与所给事实客观判断，对每个指标给出分数与简短理由。只返回 JSON，不要多余文字。', '待评价街区：{street_name}
当前评价维度：{dim_name}

【街区事实】
{facts}

【本批需打分的指标（共 {metric_count} 项）】
{metrics_block}

请对以上每个指标打分，返回如下 JSON：
{{
  "scores": [
    {{"code": "指标code", "score": 1到5的整数, "reason": "简短理由"}}
  ]
}}
注意：scores 必须覆盖本批全部指标，code 必须与上面给出的完全一致。', '{street_name} {dim_name} {facts} {metric_count} {metrics_block}', 1);
INSERT INTO ai_prompt_template (id, stage, dim_code, name, system_prompt, user_template, placeholders, version) VALUES (5, 'score', 'VITALITY', '评分-活力人气', '你是一名资深的城市街区时尚度评价专家。你将依据给定的评价指标，对一条街区逐项打分。评分为整数，取值 1~5：5=极高，4=较高，3=一般，2=较低，1=极低。请基于常识与所给事实客观判断，对每个指标给出分数与简短理由。只返回 JSON，不要多余文字。', '待评价街区：{street_name}
当前评价维度：{dim_name}

【街区事实】
{facts}

【本批需打分的指标（共 {metric_count} 项）】
{metrics_block}

请对以上每个指标打分，返回如下 JSON：
{{
  "scores": [
    {{"code": "指标code", "score": 1到5的整数, "reason": "简短理由"}}
  ]
}}
注意：scores 必须覆盖本批全部指标，code 必须与上面给出的完全一致。', '{street_name} {dim_name} {facts} {metric_count} {metrics_block}', 1);
INSERT INTO ai_prompt_template (id, stage, dim_code, name, system_prompt, user_template, placeholders, version) VALUES (6, 'score', 'INFLUENCE', '评分-传播影响', '你是一名资深的城市街区时尚度评价专家。你将依据给定的评价指标，对一条街区逐项打分。评分为整数，取值 1~5：5=极高，4=较高，3=一般，2=较低，1=极低。请基于常识与所给事实客观判断，对每个指标给出分数与简短理由。只返回 JSON，不要多余文字。', '待评价街区：{street_name}
当前评价维度：{dim_name}

【街区事实】
{facts}

【本批需打分的指标（共 {metric_count} 项）】
{metrics_block}

请对以上每个指标打分，返回如下 JSON：
{{
  "scores": [
    {{"code": "指标code", "score": 1到5的整数, "reason": "简短理由"}}
  ]
}}
注意：scores 必须覆盖本批全部指标，code 必须与上面给出的完全一致。', '{street_name} {dim_name} {facts} {metric_count} {metrics_block}', 1);
INSERT INTO ai_prompt_template (id, stage, dim_code, name, system_prompt, user_template, placeholders, version) VALUES (7, 'report', NULL, '报告生成', '你是一名城市街区分析报告撰写专家。依据各维度评分，撰写一段凝练、专业、可读的中文综合评价。只返回 JSON。', '街区：{street_name}
综合时尚度评分（5 分制）：{total_score}
各一级维度得分：
{dim_block}

请生成如下 JSON：
{{
  "summary": "150字以内的综合画像，概括该街区的时尚度特征",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["短板1", "短板2"],
  "suggestions": ["提升建议1", "提升建议2"]
}}', '{street_name} {total_score} {dim_block}', 1);

-- =========================================================
-- 分析中心显示配置（资源中心「分析管理」可配，默认全部启用）
-- block_key 与前端 /analytics 区块一一对应；前端按 enabled 条件渲染。
-- =========================================================
INSERT INTO analytics_display_config (block_key, block_group, name, description, enabled, sort_no) VALUES
  ('header_image',    'overview', '街景原图',       '结果页头部展示用户上传的街景原图（文字点评无原图时自动隐藏）', 1, 1),
  ('total_score',     'overview', '综合评分',       '头部右上角的综合时尚度评分（5 分制）',                       1, 2),
  ('radar_chart',     'visual',   '维度雷达图',     '五个一级维度构成的「街道 DNA 指纹」雷达图',                   1, 1),
  ('dimension_break', 'visual',   '一级维度拆解',   '各一级维度得分与进度条（指标拆解）',                         1, 2),
  ('sub_dimension',   'detail',   '二级维度明细',   '每个一级维度下 5 个二级维度的得分明细',                       1, 1),
  ('metric_score',    'detail',   '三级指标得分',   '全部 75 个三级指标的逐项得分',                               1, 2),
  ('metric_reason',   'detail',   '得分依据',       '三级指标的 AI 评分理由（依赖「三级指标得分」开启）',         1, 3),
  ('ai_summary',      'report',   'AI 街道画像',    'AI 生成的综合评价画像文本',                                 1, 1),
  ('similar_streets', 'report',   '相似审美节点',   '相似街区推荐区块（数据接入后展示）',                         1, 2);
