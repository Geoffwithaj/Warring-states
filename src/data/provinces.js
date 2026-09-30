// Province definitions. Positions are approximate real-world lon/lat of each
// commandery seat; they are projected onto the map canvas by projectLonLat().
// pop is in thousands. terrain drives the tactical battlefield generator.

export const MAP_WIDTH = 1040;
export const MAP_HEIGHT = 1010;

export function projectLonLat(lon, lat) {
  return [Math.round((lon - 97.2) * 36 + 30), Math.round((42.4 - lat) * 43 + 20)];
}

// [id, name, lon, lat, pop(k), terrain, flags]
// flags: r = river (flood-prone), h = horse country (cheap cavalry)
const RAW = [
  ['xiangping', 'Xiangping', 123.2, 41.3, 180, 'hills', 'h'],
  ['beiping', 'Beiping', 119.0, 40.0, 220, 'plains', 'h'],
  ['ji', 'Ji', 116.4, 39.9, 300, 'plains', 'h'],
  ['dai', 'Dai', 113.3, 40.1, 150, 'mountains', 'h'],
  ['nanpi', 'Nanpi', 116.9, 38.3, 380, 'plains', 'r'],
  ['jinyang', 'Jinyang', 112.5, 37.9, 250, 'mountains', 'h'],
  ['shangdang', 'Shangdang', 113.1, 36.2, 180, 'mountains', ''],
  ['ye', 'Ye', 114.4, 36.3, 450, 'plains', 'r'],
  ['pingyuan', 'Pingyuan', 116.5, 36.9, 330, 'plains', 'r'],
  ['beihai', 'Beihai', 118.8, 36.6, 350, 'hills', ''],
  ['langye', 'Langye', 118.4, 35.1, 300, 'hills', ''],
  ['puyang', 'Puyang', 115.0, 35.7, 360, 'plains', 'r'],
  ['chenliu', 'Chenliu', 114.5, 34.8, 400, 'plains', 'r'],
  ['xiaopei', 'Xiaopei', 116.9, 34.4, 330, 'plains', ''],
  ['xiapi', 'Xiapi', 118.0, 34.0, 380, 'marsh', 'r'],
  ['xuchang', 'Xuchang', 113.8, 34.0, 420, 'plains', ''],
  ['luoyang', 'Luoyang', 112.4, 34.6, 500, 'hills', 'r'],
  ['hongnong', 'Hongnong', 110.9, 34.6, 200, 'mountains', 'r'],
  ['changan', "Chang'an", 108.9, 34.3, 480, 'plains', 'r'],
  ['anding', 'Anding', 106.7, 35.6, 120, 'hills', 'h'],
  ['tianshui', 'Tianshui', 105.7, 34.6, 180, 'mountains', 'h'],
  ['xiliang', 'Xiliang', 103.8, 36.1, 130, 'mountains', 'hr'],
  ['wuwei', 'Wuwei', 102.6, 37.9, 120, 'plains', 'h'],
  ['hanzhong', 'Hanzhong', 107.0, 33.1, 250, 'mountains', ''],
  ['zitong', 'Zitong', 105.2, 31.6, 200, 'mountains', ''],
  ['chengdu', 'Chengdu', 104.1, 30.7, 500, 'plains', ''],
  ['jiangzhou', 'Jiangzhou', 106.5, 29.6, 280, 'hills', 'r'],
  ['yongan', "Yong'an", 109.5, 31.0, 150, 'mountains', 'r'],
  ['jianning', 'Jianning', 103.8, 25.5, 120, 'mountains', ''],
  ['yunnan', 'Yunnan', 100.2, 25.6, 110, 'mountains', ''],
  ['zangke', 'Zangke', 107.2, 26.6, 90, 'forest', ''],
  ['wan', 'Wan', 112.5, 33.0, 450, 'plains', ''],
  ['runan', 'Runan', 114.4, 33.0, 420, 'plains', ''],
  ['shouchun', 'Shouchun', 116.8, 32.6, 350, 'marsh', 'r'],
  ['xiangyang', 'Xiangyang', 112.1, 32.0, 380, 'hills', 'r'],
  ['jiangling', 'Jiangling', 112.2, 30.3, 330, 'marsh', 'r'],
  ['jiangxia', 'Jiangxia', 114.3, 30.6, 260, 'marsh', 'r'],
  ['lujiang', 'Lujiang', 117.2, 31.3, 260, 'hills', 'r'],
  ['jianye', 'Jianye', 118.8, 32.0, 320, 'hills', 'r'],
  ['wu', 'Wu', 120.6, 31.3, 330, 'marsh', ''],
  ['kuaiji', 'Kuaiji', 120.6, 29.7, 280, 'hills', ''],
  ['chaisang', 'Chaisang', 116.0, 29.7, 200, 'marsh', 'r'],
  ['yuzhang', 'Yuzhang', 115.9, 28.4, 230, 'forest', ''],
  ['changsha', 'Changsha', 113.0, 28.2, 280, 'forest', 'r'],
  ['wuling', 'Wuling', 111.2, 29.0, 150, 'forest', ''],
  ['lingling', 'Lingling', 111.6, 26.4, 160, 'forest', ''],
  ['guiyang', 'Guiyang', 113.0, 25.8, 140, 'mountains', ''],
  ['jianan', "Jian'an", 119.0, 26.4, 130, 'mountains', ''],
  ['nanhai', 'Nanhai', 113.3, 23.1, 200, 'hills', ''],
  ['cangwu', 'Cangwu', 110.5, 23.5, 130, 'forest', ''],
  ['jiaozhi', 'Jiaozhi', 105.8, 21.0, 220, 'forest', 'r'],
];

// Economic potential: [fertile tiles, market sites] on each province's land.
// Every fertile tile is worth 25 Farmland and every market site 60 Commerce,
// so these set each province's development caps. Judged from geography and
// history: the Central Plains granaries, the Chengdu basin, the river and
// coastal ports, the Silk Road towns of Liangzhou.
export const POTENTIAL = {
  ye: [38, 12], chenliu: [38, 11], chengdu: [38, 14], xuchang: [36, 12], runan: [36, 9],
  nanpi: [34, 8], pingyuan: [34, 7], puyang: [34, 8], wan: [34, 12], changan: [30, 15],
  xiaopei: [30, 8], shouchun: [30, 10], jiangling: [30, 13], luoyang: [28, 16], xiapi: [28, 12],
  xiangyang: [28, 14], wu: [28, 15], beihai: [26, 10], langye: [24, 9], changsha: [24, 9],
  jianye: [22, 12], kuaiji: [22, 12], jiaozhi: [22, 12], ji: [22, 9], lujiang: [22, 8],
  hanzhong: [20, 7], jiangxia: [20, 11], yuzhang: [20, 7], jinyang: [18, 7], jiangzhou: [18, 9],
  nanhai: [18, 13], beiping: [16, 6], chaisang: [16, 9], hongnong: [14, 7], wuling: [14, 5],
  lingling: [14, 5], xiangping: [12, 5], shangdang: [12, 5], tianshui: [12, 5], cangwu: [12, 6],
  wuwei: [10, 10], anding: [10, 4], zitong: [10, 4], jianning: [10, 4], yunnan: [10, 4],
  guiyang: [10, 4], xiliang: [8, 7], dai: [8, 4], yongan: [8, 5], jianan: [8, 5], zangke: [6, 3],
};

export const PROVINCES = RAW.map(([id, name, lon, lat, pop, terrain, flags]) => {
  const [x, y] = projectLonLat(lon, lat);
  const [fertile, markets] = POTENTIAL[id];
  return { id, name, x, y, pop: pop * 1000, terrain, river: flags.includes('r'), horses: flags.includes('h'), fertile, markets };
});

// Rough outline of Han China (lon/lat), used to clip province regions.
export const OUTLINE = [
  [98.2, 39.8], [100.5, 40.2], [102.6, 39.6], [104.5, 38.9], [106.0, 39.6], [107.2, 41.2],
  [109.5, 41.6], [112.0, 41.5], [114.5, 41.8], [117.0, 41.6], [119.5, 42.2], [122.0, 42.3],
  [124.8, 42.0], [125.2, 40.6], [124.2, 39.9], [122.8, 39.5], [121.4, 38.9], [121.9, 39.8],
  [122.3, 40.6], [121.0, 40.9], [119.8, 40.0], [118.8, 39.3], [117.8, 38.9], [118.2, 38.2],
  [118.9, 37.4], [120.2, 37.6], [121.3, 37.6], [122.5, 37.3], [121.2, 36.7], [120.2, 36.0],
  [119.4, 35.0], [120.3, 34.0], [120.9, 32.6], [121.9, 31.5], [121.0, 30.6], [122.0, 29.9],
  [121.5, 28.8], [120.8, 27.8], [119.7, 26.4], [119.2, 25.3], [117.8, 24.3], [116.5, 23.2],
  [115.0, 22.7], [113.6, 22.3], [112.0, 21.7], [110.5, 21.2], [109.6, 21.5], [108.4, 21.6],
  [107.4, 21.0], [106.5, 20.2], [105.8, 19.3], [105.2, 19.6], [104.4, 21.2], [103.2, 22.6],
  [101.5, 22.2], [99.8, 22.3], [98.6, 24.0], [98.3, 25.8], [98.8, 27.3], [99.8, 28.4],
  [101.0, 30.2], [101.6, 32.0], [101.2, 33.8], [100.2, 35.2], [99.4, 36.8], [98.2, 38.4],
].map(([lon, lat]) => projectLonLat(lon, lat));

const RAW_RIVERS = {
  yellow: [
    [101.5, 36.0], [103.8, 36.1], [105.5, 37.5], [106.5, 39.3], [108.0, 40.7], [111.0, 40.3],
    [111.3, 39.0], [110.5, 37.0], [110.4, 35.0], [111.2, 34.8], [112.5, 34.9], [114.0, 34.9],
    [115.0, 35.7], [116.5, 36.6], [118.5, 37.7], [119.0, 37.6],
  ],
  yangtze: [
    [99.2, 28.0], [100.2, 27.0], [102.5, 26.2], [104.6, 28.8], [106.5, 29.6], [108.4, 30.8],
    [110.5, 31.0], [111.3, 30.7], [112.2, 30.2], [113.2, 29.5], [114.3, 30.6], [116.0, 29.8],
    [117.2, 30.8], [118.8, 32.0], [120.3, 32.0], [121.6, 31.6],
  ],
  han: [[107.0, 33.1], [109.5, 32.7], [111.2, 32.5], [112.1, 32.0], [113.0, 30.8], [114.3, 30.6]],
  wei: [[105.7, 34.6], [107.5, 34.4], [108.9, 34.3], [110.4, 34.6]],
  huai: [[113.5, 32.5], [115.5, 32.5], [116.8, 32.6], [118.0, 33.3], [119.8, 33.9]],
};

export const RIVERS = Object.fromEntries(
  Object.entries(RAW_RIVERS).map(([k, pts]) => [k, pts.map(([lon, lat]) => projectLonLat(lon, lat))]),
);
