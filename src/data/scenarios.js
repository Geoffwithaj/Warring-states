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
    // Unaffiliated officers: [name, province, debut year]. An officer whose
    // family is serving a lord at debut joins that lord instead.
    free: [
      ['Xun Yu', 'xuchang', 190], ['Guo Jia', 'xuchang', 190], ['Xu Shu', 'xuchang', 195],
      ['Chen Qun', 'xuchang', 195], ['Xun You', 'changan', 190], ['Zhong Yao', 'changan', 190],
      ['Cheng Yu', 'puyang', 190], ['Man Chong', 'puyang', 190], ['Pan Zhang', 'puyang', 200],
      ['Dian Wei', 'chenliu', 190], ['Xu Chu', 'xiaopei', 190], ['Xu Huang', 'hongnong', 190],
      ['Jia Kui', 'hongnong', 195], ['Liu Ye', 'shouchun', 190], ['Jiang Ji', 'shouchun', 200],
      ['Sima Yi', 'luoyang', 201], ['Hao Zhao', 'jinyang', 212], ['Deng Ai', 'wan', 225],
      ['Zhuge Liang', 'xiangyang', 197], ['Pang Tong', 'xiangyang', 200], ['Ma Liang', 'xiangyang', 207],
      ['Ma Su', 'xiangyang', 210], ['Fa Zheng', 'chengdu', 196], ['Meng Da', 'chengdu', 196],
      ['Jiang Wan', 'lingling', 210], ['Fei Yi', 'jiangzhou', 212], ['Wang Ping', 'hanzhong', 205],
      ['Liao Hua', 'runan', 190], ['Zhou Cang', 'runan', 190], ['Chen Dao', 'pingyuan', 195],
      ['Li Hui', 'jianning', 205], ['Ma Zhong', 'jianning', 210], ['Jiang Wei', 'tianshui', 220],
      ['Zhou Yu', 'lujiang', 190], ['Zhou Tai', 'lujiang', 190], ['Jiang Qin', 'lujiang', 190],
      ['Chen Wu', 'lujiang', 195], ['Ding Feng', 'lujiang', 210], ['Zhang Zhao', 'xiapi', 190],
      ['Lu Su', 'xiapi', 195], ['Bu Zhi', 'xiapi', 200], ['Zhang Hong', 'jianye', 190],
      ['Lu Xun', 'wu', 200], ['Ling Cao', 'wu', 190], ['Ling Tong', 'wu', 205], ['Gu Yong', 'wu', 195],
      ['Zhu Huan', 'wu', 200], ['Kan Ze', 'kuaiji', 200], ['Xu Sheng', 'langye', 195],
      ['Zhuge Jin', 'langye', 196], ['Lu Meng', 'runan', 193], ['Taishi Ci', 'beihai', 190],
      ['Gan Ning', 'jiangzhou', 190], ['Hua Xin', 'yuzhang', 195],
      ['Liu Du', 'lingling', 190], ['Xing Daorong', 'lingling', 190], ['Zhao Fan', 'guiyang', 190],
      ['Chen Ying', 'guiyang', 190], ['Bao Long', 'guiyang', 190], ['Jin Xuan', 'wuling', 190],
      ['Gong Zhi', 'wuling', 190], ['Shamoke', 'wuling', 190], ['Han Xuan', 'changsha', 190],
      ['Wutugu', 'zangke', 215],
      // Sons and heirs who come of age in their family's service.
      ['Sun Quan', 'changsha', 196], ['Sun Shangxiang', 'changsha', 205], ['Cao Pi', 'chenliu', 204],
      ['Cao Zhang', 'chenliu', 206], ['Cao Zhen', 'chenliu', 202], ['Cao Xiu', 'chenliu', 200],
      ['Yuan Shang', 'nanpi', 196], ['Ma Dai', 'wuwei', 195], ['Guan Ping', 'pingyuan', 195],
      ['Guan Xing', 'pingyuan', 219], ['Zhang Bao', 'pingyuan', 219], ['Liu Zong', 'xiangyang', 205],
    ],
  },
];
