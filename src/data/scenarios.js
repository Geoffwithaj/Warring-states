// Scenario definitions. In each force the first officer listed in a province
// governs it; the ruler's province is the capital.

export const SCENARIOS = [
  {
    id: 'coalition-190',
    name: 'The Coalition Against Dong Zhuo',
    year: 190,
    month: 1,
    blurb:
      'Dong Zhuo holds the Emperor in Luoyang. Across the realm, lords raise armies in the name of the Han — and in their own.',
    forces: [
      {
        ruler: 'Dong Zhuo', color: '#6b3fa0',
        provinces: {
          luoyang: ['Dong Zhuo', 'Lu Bu', 'Li Ru', 'Hua Xiong', 'Li Su', 'Hu Zhen', 'Xu Rong'],
          hongnong: ['Niu Fu', 'Jia Xu', 'Li Jue', 'Guo Si'],
          changan: ['Zhang Ji', 'Fan Chou', 'Zhang Xiu', 'Zhang Liao', 'Gao Shun'],
        },
      },
      {
        ruler: 'Yuan Shao', color: '#d4a017',
        provinces: {
          nanpi: ['Yuan Shao', 'Yan Liang', 'Wen Chou', 'Tian Feng', 'Feng Ji', 'Guo Tu', 'Xu You', 'Chunyu Qiong', 'Yuan Tan', 'Yuan Xi', 'Xin Ping', 'Xin Pi'],
        },
      },
      {
        ruler: 'Han Fu', color: '#9a8c5a',
        provinces: { ye: ['Han Fu', 'Pan Feng', 'Ju Shou', 'Shen Pei', 'Zhang He', 'Gao Lan'] },
      },
      {
        ruler: 'Cao Cao', color: '#2f5fb3',
        provinces: {
          chenliu: ['Cao Cao', 'Xiahou Dun', 'Xiahou Yuan', 'Cao Ren', 'Cao Hong', 'Cao Chun', 'Yue Jin', 'Li Dian', 'Chen Gong'],
        },
      },
      {
        ruler: 'Liu Bei', color: '#2e8b57',
        provinces: { pingyuan: ['Liu Bei', 'Guan Yu', 'Zhang Fei', 'Jian Yong', 'Sun Qian'] },
      },
      {
        ruler: 'Sun Jian', color: '#c0392b',
        provinces: {
          changsha: ['Sun Jian', 'Sun Ce', 'Cheng Pu', 'Huang Gai', 'Han Dang', 'Zu Mao', 'Sun Jing', 'Wu Jing', 'Zhu Zhi'],
        },
      },
      {
        ruler: 'Yuan Shu', color: '#b86b2d',
        provinces: {
          wan: ['Yuan Shu', 'Yan Xiang', 'Lei Bo', 'Chen Lan', 'Zhang Xun', 'Yang Hong', 'Han Yin', 'Yuan Yin'],
          runan: ['Ji Ling', 'Qiao Rui', 'Li Feng'],
        },
      },
      {
        ruler: 'Liu Biao', color: '#1f8a8a',
        provinces: {
          xiangyang: ['Liu Biao', 'Kuai Liang', 'Kuai Yue', 'Cai Mao', 'Zhang Yun', 'Wang Wei', 'Yi Ji', 'Liu Qi', 'Wei Yan'],
          jiangling: ['Wen Pin', 'Huang Zhong'],
          jiangxia: ['Huang Zu'],
        },
      },
      {
        ruler: 'Liu Yan', color: '#7a9a3a',
        provinces: {
          chengdu: ['Liu Yan', 'Liu Zhang', 'Huang Quan', 'Zhang Song', 'Wang Lei', 'Wu Yi', 'Wu Ban', 'Fei Guan', 'Li Yan'],
          zitong: ['Zhang Ren', 'Leng Bao', 'Deng Xian', 'Liu Gui'],
          jiangzhou: ['Yan Yan', 'Yang Huai', 'Gao Pei'],
        },
      },
      {
        ruler: 'Zhang Lu', color: '#8d6e63',
        provinces: { hanzhong: ['Zhang Lu', 'Yan Pu', 'Yang Ren', 'Yang Ang', 'Yang Song', 'Zhang Wei'] },
      },
      {
        ruler: 'Ma Teng', color: '#5d7285',
        provinces: {
          wuwei: ['Ma Teng', 'Ma Xiu', 'Ma Tie'],
          tianshui: ['Ma Chao', 'Pang De'],
        },
      },
      {
        ruler: 'Han Sui', color: '#a1887f',
        provinces: { xiliang: ['Han Sui', 'Yan Xing', 'Cheng Yi', 'Yang Qiu', 'Hou Xuan', 'Li Kan', 'Liang Xing'] },
      },
      {
        ruler: 'Gongsun Zan', color: '#e0e0e0',
        provinces: { beiping: ['Gongsun Zan', 'Zhao Yun', 'Tian Kai', 'Yan Gang', 'Gongsun Yue', 'Gongsun Fan', 'Guan Jing'] },
      },
      {
        ruler: 'Liu Yu', color: '#b39ddb',
        provinces: { ji: ['Liu Yu', 'Xianyu Fu', 'Tian Chou'] },
      },
      {
        ruler: 'Gongsun Du', color: '#607d8b',
        provinces: { xiangping: ['Gongsun Du', 'Gongsun Kang', 'Gongsun Gong'] },
      },
      {
        ruler: 'Kong Rong', color: '#f48fb1',
        provinces: { beihai: ['Kong Rong', 'Wang Xiu', 'Zong Bao'] },
      },
      {
        ruler: 'Tao Qian', color: '#4db6ac',
        provinces: {
          xiapi: ['Tao Qian', 'Cao Bao', 'Mi Zhu', 'Mi Fang', 'Chen Gui', 'Chen Deng'],
          langye: ['Zang Ba', 'Sun Guan'],
        },
      },
      {
        ruler: 'Liu Dai', color: '#90a4ae',
        provinces: { puyang: ['Liu Dai', 'Bao Xin', 'Yu Jin'] },
      },
      {
        ruler: 'Liu Yao', color: '#ffb74d',
        provinces: { jianye: ['Liu Yao', 'Ze Rong', 'Xue Li', 'Zhang Ying', 'Fan Neng'] },
      },
      {
        ruler: 'Yan Baihu', color: '#795548',
        provinces: { wu: ['Yan Baihu', 'Yan Yu'] },
      },
      {
        ruler: 'Wang Lang', color: '#aed581',
        provinces: { kuaiji: ['Wang Lang', 'Yu Fan'] },
      },
      {
        ruler: 'Shi Xie', color: '#ff8a65',
        provinces: { jiaozhi: ['Shi Xie', 'Shi Yi', 'Shi Wu'], nanhai: ['Shi Hui'] },
      },
      {
        ruler: 'Zhang Yan', color: '#455a64',
        provinces: { shangdang: ['Zhang Yan'] },
      },
      {
        ruler: 'Meng Huo', color: '#827717',
        provinces: { yunnan: ['Meng Huo', 'Zhu Rong', 'Meng You', 'Dai Lai Dongzhu', 'Ahuinan', 'Dongtuna'] },
      },
    ],
    // Searchable free officers and heirs follow RTK II's Scenario 1 schedule
    // (see RTK2_SCENARIO_1 below). These are extra officers from outside that
    // list: [name, province, debut year].
    extraFree: [
      ['Taishi Ci', 'beihai', 190], ['Jiang Qin', 'lujiang', 190], ['Chen Wu', 'lujiang', 195],
      ['Kan Ze', 'kuaiji', 200], ['Bu Zhi', 'xiapi', 200], ['Hua Xin', 'yuzhang', 195],
      ['Jiang Ji', 'shouchun', 200], ['Deng Ai', 'wan', 225], ['Wutugu', 'zangke', 215],
      ['Bao Long', 'guiyang', 190], ['Sun Shangxiang', 'changsha', 205], ['Yuan Shang', 'nanpi', 196],
    ],
    extraHeirs: [['Sun Jian', 'Sun Shangxiang'], ['Yuan Shao', 'Yuan Shang']],
    freeSchedule: 'rtk2-1',
  },
];

// ---- RTK II free-officer schedule -------------------------------------------
// Transcribed from the "Free Generals Compendium" for RTK II (SNES) by
// B.L. Timmins (GameFAQs, 2020), Scenario 1 (189 AD). The number is RTK II's
// province and the year is when the officer becomes searchable (January).

// RTK II has 41 provinces and this map has 51, so each RTK II province number is
// mapped to the province here that best fits who appears in it.
export const RTK2_PROVINCES = {
  1: 'xiangping', 3: 'ji', 4: 'pingyuan', 5: 'jinyang', 6: 'nanpi', 8: 'ye', 9: 'chenliu',
  10: 'luoyang', 11: 'hongnong', 12: 'changan', 13: 'tianshui', 14: 'wuwei', 15: 'xiliang',
  16: 'wan', 17: 'xuchang', 18: 'shouchun', 19: 'jiangling', 20: 'xiangyang', 21: 'changsha',
  22: 'guiyang', 23: 'lingling', 24: 'jianye', 25: 'wu', 26: 'kuaiji', 27: 'yuzhang',
  28: 'lujiang', 29: 'yongan', 30: 'zitong', 31: 'zangke', 32: 'hanzhong', 33: 'chengdu',
  34: 'jiangzhou', 35: 'jianning', 36: 'yunnan',
};

// The guide's romanisations that differ from the names used in this game.
export const RTK2_NAME_ALIASES = {
  'Xu Zhu': 'Xu Chu', 'Ma Xu': 'Ma Su', 'Fei Wei': 'Fei Yi', 'Zhang Xiou': 'Zhang Xiu#2',
  'Zhuge Luo': 'Zhuge Ke', 'Zhang Yi(3)': 'Zhang Ni', 'Zhang Yi(2)': 'Zhang Yi',
  'Shang Quang': 'Shang Guang', 'Shamo Ke': 'Shamoke', 'Xingdao Rong': 'Xing Daorong',
  'Lui Xun': 'Liu Xun', 'Zhang Hing': 'Zhang Heng',
};

// Same name, different person: which one the guide means in a given province.
const PROVINCE_NAME_ALIASES = { '33 Yang Hong': 'Yang Hong#2', '27 Ma Zhong': 'Ma Zhong#2' };

export const RTK2_SCENARIO_1 = `
01 Gongsun Yuan-220|03 Zhao Tong-200|03 Zhao Yun-190|03 Zhao Guang-202|04 Zhang Bao-204|04 Liu Feng-205
04 Guan Xing-203|04 Guan Suo-207|04 Liu Chan-222|04 Guan Ping-195|05 Hao Zhao-201|05 Han Sui-189
06 Shen Rong-193|06 Jian Yong-194|06 Wang Xiu-192|06 Chunyu Qiong-190|06 Zhang Nan-189|06 Jiang Yiqu-189
06 Xu You-189|08 Xin Pi-193|08 Yu Jin-194|08 Zhuge Dan-225|09 Wang Kai-191|09 Guo Jia-192
09 Xiahou En-189|09 Liu Ye-191|09 Xiahou Ba-201|09 Bao Xin-190|09 Xun Yu-192|09 Xun You-192
09 Xiahou Wei-204|09 Li Dian-189|09 Xiahou Mao-193|09 Wang Zhong-190|09 Dian Wei-192|09 Cheng Yu-191
09 Xu Zhu-195|09 Xiahou Hui-210|09 Mao Jie-189|09 Xiahou Shang-203|09 Xiahou De-203|09 Xiahou He-216
09 Liu Dai-189|10 Sima Shi-223|10 Zhou Cang-192|10 Xu Huang-195|10 Yang Xiu-198|10 Hu Xin-189
10 Zhuge Jin-195|10 Zhang Liao-193|10 Man Chong-190|10 Sima Zhao-226|10 Wang Kuang-189|10 Sima Yi-195
10 Song Xian-189|11 Chen Jiao-194|11 Jia Kui-200|11 Du Xi-193|11 Dong Heng-194|12 Wang Shuang-216
12 Huang Wan-189|13 Jiang Wei-222|13 Guo Huai-215|14 Liang Xing-192|14 Ma Dai-192|14 Cheng Yi-189
14 Ma Wan-190|14 Li Zhan-191|14 Ma Tie-193|14 Zhang Hing-193|14 Ma Xiu-195|14 Ma Chao-191
14 Pang De-194|15 Yang Qiu-189|16 Zhuge Liang-196|17 Zhong Yao-189|17 Cao Zhen-200|17 Dian Man-195
17 Cao Xiu-205|17 Liao Hua-194|17 Cao Rui-220|17 Zhong Hui-230|17 Fu Gan-192|17 Chen Tai-215
17 Guo Yi-200|17 Cao Pi-202|17 Chen Qun-206|17 Lu Jian-189|17 Zhu Ling-189|17 Cao Shuang-230
17 Zhang Miao-189|17 Cheng Wu-216|17 Cao Zhang-205|17 Chen Xi-191|17 Lu Qian-189|17 Cao Zhi-207
17 Li Tong-189|18 Jia Hua-189|18 Tan Xiong-200|18 Ling Cao-189|18 Ling Tong-200|19 Ma Liang-202
19 Han Xian-189|19 Xu Shu-192|19 Ma Xu-205|19 Pang Tong-194|19 Fu Shiren-214|20 Liu Qi-195
20 Cai He-197|20 Li Gui-189|20 Cai Zhong-200|20 Gong Zhi-190|20 Huang Zhong-202|20 Wang Can-189
20 Huo Jun-193|20 Jin Xuan-201|20 Liu Ba-192|20 Liu Zong-200|20 Yi Ji-201|20 Wang Wei-193
21 Sun Liang-258|21 Sun Huan-201|21 Han Xuan-200|21 Yang Ling-200|21 Sun Deng-222|21 Sun He-238
21 Zhou Tai-189|21 Ding Feng-189|21 Sun Yi-199|21 Huan Cheng-191|21 Sun Quan-197|21 Gan Ning-190
21 Han Hao-190|21 Sun Yu-198|21 Zhang Yun-189|22 Zhao Fan-189|22 Chen Ying-202|23 Liu Du-194
23 Jiang Wan-202|23 Xingdao Rong-207|23 Wei Yan-193|24 Quan Zong-198|24 Lu Ba-215|24 Xue Zong-202
24 Cheng Bing-200|24 Song Qian-194|24 Lu Meng-193|24 Zhou Fang-208|24 Lu Xun-200|24 Zhang Cheng-202
24 Zhou Yu-194|24 Zhang Xiou-195|24 Dong Xi-200|24 Lu Su-200|24 Gu Yong-192|24 Yan Jun-201
24 Lu Ji-200|24 Zhang Zhao-195|24 Zhuge Luo-218|24 Zhang Hong-195|24 Zhang Wen-206|24 Xie Jing-209
25 Cai Xun-189|25 Zhu Huan-201|25 Li Yi-189|25 Xu Sheng-200|26 Zhu Ran-189|27 Lu Fan-189
27 Ma Zhong-195|27 Pan Zhang-191|29 Yuan Pu-190|30 Fei Shi-193|30 Li Yan-189|31 Liu Bao-209
31 Zhang Zhu-210|32 Fei Guan-210|32 Wang Ping-202|32 Yang Yi-210|32 Li Hui-193|32 Zhang Yi(3)-216
33 Pang Yi-210|33 Wang Lei-189|33 Zhang Song-194|33 Deng Zhi-214|33 Yang Hong-199|33 Deng Qian-192
33 Dong Yun-211|33 Guo Youzhi-216|33 Liu Xun-205|33 Fa Zheng-191|33 Fu Tong-216|33 Fei Wei-210
33 Yin Mo-217|33 Xu Jing-189|33 Chen Shi-208|34 Wu Ban-205|34 Huang Quan-189|34 Zhang Yi(2)-214
34 Lu Yi-189|34 Shang Quang-199|35 Wang Kang-189|35 Shamo Ke-215|35 Lu Kai-189|35 Meng Da-189
36 Gao Ding-189
`;

// Heirs and protégés who join a relative's lord directly if that relative is
// serving when they appear; otherwise they turn up as searchable free officers.
export const RTK2_AUTO_JOIN = {
  'Sun Jian': ['Lu Meng', 'Zhou Yu', 'Sun Quan', 'Sun Yu', 'Sun Yi', 'Lu Su', 'Lu Xun', 'Sun Huan'],
  'Guo Jia': ['Guo Yi'],
  'Lu Meng': ['Lu Ba'],
  'Xiahou Yuan': ['Xiahou Ba', 'Xiahou Wei', 'Xiahou Hui', 'Xiahou He'],
  'Xiahou Dun': ['Xiahou Mao', 'Xiahou De', 'Xiahou Shang'],
  'Guan Yu': ['Guan Ping', 'Guan Xing', 'Guan Suo'],
  'Zhuge Jin': ['Zhuge Luo'],
  'Sima Yi': ['Sima Shi', 'Sima Zhao'],
  'Zhong Yao': ['Zhong Hui'],
  'Cao Zhen': ['Cao Shuang'],
  'Cao Cao': ['Sima Yi', 'Cao Zhen', 'Cao Pi', 'Cao Xiu', 'Cao Zhang', 'Cao Zhi', 'Cao Rui'],
  'Sun Quan': ['Sun Deng', 'Sun He', 'Sun Liang'],
  'Zhao Yun': ['Zhao Tong', 'Zhao Guang'],
  'Zhang Zhao': ['Zhang Xiou', 'Zhang Cheng'],
  'Zhang Fei': ['Zhang Bao'],
  'Chen Qun': ['Chen Tai'],
  'Cheng Yu': ['Cheng Wu'],
  'Dian Wei': ['Dian Man'],
  'Ma Teng': ['Ma Chao', 'Ma Dai', 'Ma Tie', 'Ma Xiu'],
  'Liu Zhang': ['Lui Xun'],
  'Liu Biao': ['Liu Qi', 'Liu Zong'],
  'Liu Bei': ['Liu Feng', 'Liu Chan'],
  'Ling Cao': ['Ling Tong'],
};

// Parses the schedule into [{ name, province, year, key }].
export function parseSchedule(text) {
  return text.trim().split(/[|\n]/).map((entry) => {
    const m = entry.trim().match(/^(\d+) (.+)-(\d+)$/);
    const [, num, raw, year] = m;
    const name = PROVINCE_NAME_ALIASES[`${Number(num)} ${raw}`] ?? RTK2_NAME_ALIASES[raw] ?? raw;
    return { name, province: RTK2_PROVINCES[Number(num)], year: Number(year) };
  });
}

export const resolveAlias = (name) => RTK2_NAME_ALIASES[name] ?? name;

export const FREE_SCHEDULES = { 'rtk2-1': RTK2_SCENARIO_1 };
