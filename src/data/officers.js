// Officer roster. Stats are INT / WAR / CHA on a 1–100 scale, in the spirit of
// the classic games (not copied from any one of them).
// "died" is a natural-lifespan year used for aging; officers who historically
// died violently young are given a plausible later year so they get to play.
// Format: 'Name|int|war|cha|born|died'. A '#2' suffix separates two people who
// share a name (e.g. Zhang Xiu the warlord and Zhang Xiu, son of Zhang Zhao).

const ROSTER = `
Cao Cao|91|72|96|155|220
Xiahou Dun|58|90|72|157|220
Xiahou Yuan|55|91|67|160|219
Cao Ren|62|86|73|168|223
Cao Hong|42|79|58|169|232
Cao Chun|55|74|62|170|210
Yue Jin|52|84|58|160|218
Li Dian|72|77|68|174|209
Dian Wei|35|97|50|160|210
Xu Chu|36|96|55|170|230
Zhang Liao|78|93|80|169|222
Xu Huang|70|90|66|169|227
Zhang He|71|89|64|167|231
Yu Jin|70|78|58|160|221
Pang De|64|94|66|170|219
Guo Jia|98|15|78|170|207
Xun Yu|95|20|90|163|212
Xun You|94|30|75|157|214
Cheng Yu|91|45|60|141|220
Jia Xu|97|43|58|147|223
Liu Ye|88|32|60|170|234
Man Chong|82|58|70|165|242
Sima Yi|98|63|88|179|251
Chen Qun|80|25|72|165|237
Zhong Yao|82|20|74|151|230
Cao Pi|80|70|82|187|226
Cao Zhang|38|91|60|189|223
Cao Zhen|67|79|72|185|231
Cao Xiu|63|78|65|180|228
Wen Pin|70|80|68|170|230
Hao Zhao|80|74|68|190|233
Deng Ai|92|82|70|197|264
Jia Kui|80|50|66|174|228
Chen Gong|90|52|70|150|215
Hua Xin|78|25|65|157|232
Jiang Ji|84|30|62|170|249
Liu Bei|78|75|99|161|223
Guan Yu|79|98|93|160|220
Zhang Fei|30|99|45|167|221
Zhao Yun|76|96|88|168|229
Zhuge Liang|100|38|94|181|234
Pang Tong|97|34|70|179|225
Xu Shu|93|65|80|170|234
Fa Zheng|94|47|64|176|225
Huang Zhong|60|95|75|148|220
Wei Yan|68|92|55|170|234
Ma Chao|44|97|80|176|222
Ma Dai|50|80|60|178|240
Guan Ping|65|80|70|178|225
Jian Yong|70|33|80|162|215
Sun Qian|76|30|82|160|215
Mi Zhu|70|30|85|165|221
Mi Fang|35|60|40|165|222
Ma Liang|88|30|82|187|225
Ma Su|85|60|64|190|228
Jiang Wan|88|35|82|188|246
Fei Yi|86|30|84|190|253
Wang Ping|72|78|60|180|248
Liao Hua|62|72|58|170|250
Zhou Cang|32|80|50|170|225
Chen Dao|60|82|65|170|230
Huang Quan|83|60|75|170|240
Yan Yan|70|82|74|150|220
Zhang Ren|76|86|70|170|225
Li Yan|80|82|70|170|234
Wu Yi|64|78|66|170|237
Jiang Wei|92|88|82|202|264
Guan Xing|60|84|70|199|234
Zhang Bao|45|85|55|199|229
Li Hui|78|60|70|175|231
Ma Zhong|65|75|60|185|249
Sun Jian|68|91|88|156|210
Sun Ce|70|94|95|175|215
Sun Quan|84|67|95|182|252
Zhou Yu|97|72|92|175|218
Lu Su|93|55|88|172|217
Lu Meng|90|82|78|178|225
Lu Xun|96|70|88|183|245
Zhang Zhao|90|20|80|156|236
Zhang Hong|88|18|75|153|212
Cheng Pu|78|82|80|155|215
Huang Gai|73|84|75|150|215
Han Dang|50|82|60|155|223
Zu Mao|45|78|55|160|210
Taishi Ci|62|95|78|166|215
Gan Ning|70|94|65|175|222
Zhou Tai|45|90|60|170|225
Jiang Qin|55|81|62|170|219
Ling Cao|40|80|60|160|210
Ling Tong|50|88|68|189|237
Xu Sheng|74|84|66|177|228
Ding Feng|64|82|60|190|271
Pan Zhang|45|80|40|180|234
Zhu Huan|70|84|62|177|238
Zhuge Jin|84|40|85|174|241
Gu Yong|84|20|78|168|243
Bu Zhi|82|40|72|178|247
Kan Ze|84|20|68|170|243
Yu Fan|85|40|50|164|233
Chen Wu|40|82|64|176|220
Sun Jing|55|65|70|160|230
Wu Jing|50|60|65|160|210
Zhu Zhi|70|64|72|156|224
Sun Shangxiang|60|78|80|190|250
Dong Zhuo|70|86|40|139|205
Lu Bu|26|100|45|161|215
Li Ru|90|30|40|150|205
Hua Xiong|40|88|40|150|205
Li Jue|30|75|25|150|205
Guo Si|25|72|25|150|205
Zhang Ji|45|72|50|150|205
Fan Chou|30|74|30|150|205
Niu Fu|25|68|30|150|205
Xu Rong|60|72|45|150|205
Li Su|72|60|60|150|205
Hu Zhen|40|68|35|150|210
Zhang Xiu|60|80|65|170|212
Gao Shun|60|88|68|160|215
Yuan Shao|70|70|90|150|205
Yan Liang|40|93|50|160|210
Wen Chou|30|94|50|160|210
Tian Feng|95|30|62|150|210
Ju Shou|94|45|70|150|210
Shen Pei|80|60|70|150|210
Feng Ji|74|30|40|150|205
Guo Tu|76|35|40|150|205
Xu You|85|30|40|150|205
Chunyu Qiong|60|70|40|150|205
Yuan Tan|50|68|60|173|210
Yuan Xi|55|55|60|175|210
Yuan Shang|50|70|72|178|210
Gao Lan|50|80|55|160|215
Xin Pi|85|30|60|170|235
Xin Ping|70|20|58|160|210
Han Fu|45|40|50|150|200
Pan Feng|20|75|30|150|200
Gongsun Zan|60|85|70|150|205
Tian Kai|45|70|50|155|205
Yan Gang|30|70|40|155|205
Gongsun Yue|40|68|50|155|205
Gongsun Fan|40|65|50|155|205
Guan Jing|60|20|40|155|205
Liu Yu|60|20|90|142|200
Xianyu Fu|50|70|60|155|210
Tian Chou|80|70|70|169|214
Gongsun Du|70|70|60|150|204
Gongsun Kang|60|70|55|170|221
Gongsun Gong|40|40|40|170|228
Kong Rong|80|25|85|153|208
Wang Xiu|70|40|70|160|215
Zong Bao|20|60|30|155|205
Tao Qian|60|40|75|132|197
Cao Bao|20|65|20|150|200
Chen Gui|80|20|60|140|205
Chen Deng|88|60|70|163|210
Zang Ba|50|78|60|165|230
Sun Guan|40|70|50|160|215
Liu Dai|50|40|60|150|200
Bao Xin|65|65|70|152|200
Yuan Shu|60|60|62|155|205
Ji Ling|40|84|50|155|205
Lei Bo|20|70|20|160|210
Chen Lan|25|70|30|160|210
Yan Xiang|80|20|40|150|205
Zhang Xun|45|70|40|160|210
Qiao Rui|20|65|30|160|205
Yang Hong|75|20|40|150|205
Li Feng|30|65|30|160|205
Han Yin|55|40|40|150|205
Yuan Yin|55|30|50|160|205
Liu Biao|70|40|85|142|208
Kuai Liang|88|30|70|160|215
Kuai Yue|90|30|70|160|214
Cai Mao|70|75|45|160|215
Zhang Yun|55|70|40|160|210
Huang Zu|55|70|40|150|208
Wang Wei|70|40|60|160|215
Yi Ji|80|30|78|170|221
Liu Qi|60|30|75|175|215
Liu Zong|40|30|55|190|240
Liu Yan|70|30|70|140|200
Liu Zhang|45|30|65|162|219
Zhang Song|90|20|40|170|215
Wang Lei|60|30|60|160|215
Wu Ban|55|70|55|170|230
Leng Bao|45|76|45|170|215
Deng Xian|40|72|40|170|215
Liu Gui|60|60|55|165|220
Yang Huai|50|70|40|170|215
Gao Pei|45|71|40|170|215
Fei Guan|60|60|55|170|225
Meng Da|70|75|40|170|228
Zhang Lu|70|40|80|160|216
Yan Pu|80|30|60|160|220
Yang Ren|40|74|40|165|215
Yang Ang|40|72|40|165|215
Yang Song|60|20|10|160|215
Zhang Wei|40|70|40|165|215
Ma Teng|50|85|80|156|212
Ma Xiu|40|72|50|175|212
Ma Tie|40|70|50|177|212
Han Sui|72|70|68|140|215
Yan Xing|40|83|50|165|220
Cheng Yi|30|74|30|160|211
Yang Qiu|40|70|30|160|215
Hou Xuan|30|70|30|160|215
Li Kan|30|70|30|160|211
Liang Xing|30|72|30|160|212
Wang Lang|80|30|70|160|228
Yan Baihu|30|72|40|150|200
Yan Yu|20|68|20|155|200
Liu Yao|60|40|70|157|200
Ze Rong|40|65|20|160|200
Xue Li|30|50|30|150|200
Zhang Ying|40|68|40|160|205
Fan Neng|30|66|30|160|205
Shi Xie|76|40|80|137|226
Shi Hui|50|60|50|165|227
Shi Yi|60|30|60|150|220
Shi Wu|40|60|40|155|215
Zhang Yan|50|80|60|150|210
Meng Huo|40|87|75|170|240
Zhu Rong|30|85|60|172|240
Meng You|20|78|40|175|240
Dai Lai Dongzhu|30|70|40|175|230
Wutugu|20|88|30|180|230
Ahuinan|20|72|20|175|230
Dongtuna|20|72|20|175|230
Liu Du|50|30|50|150|215
Xing Daorong|20|78|20|165|210
Zhao Fan|50|40|50|155|215
Chen Ying|30|70|30|165|210
Bao Long|20|70|20|165|210
Jin Xuan|40|50|30|155|210
Gong Zhi|60|40|60|165|225
Shamoke|20|85|30|175|222
Han Xuan|30|60|20|150|215
Gongsun Yuan|60|70|40|190|238
Zhao Tong|50|70|55|190|240
Zhao Guang|55|75|60|192|245
Liu Feng|45|78|50|190|220
Guan Suo|55|80|65|192|225
Liu Chan|20|15|70|207|271
Shen Rong|40|50|45|170|205
Zhang Nan|45|70|40|165|222
Jiang Yiqu|30|72|35|165|215
Zhuge Dan|70|70|70|205|258
Wang Kai|45|60|40|165|215
Xiahou En|30|65|30|170|208
Xiahou Ba|60|82|60|190|259
Xiahou Wei|55|70|55|195|255
Xiahou Mao|40|50|40|185|240
Wang Zhong|40|62|40|165|220
Xiahou Hui|70|40|60|200|240
Mao Jie|80|30|70|160|216
Xiahou Shang|60|50|55|185|225
Xiahou De|40|65|40|185|220
Xiahou He|65|40|55|200|250
Sima Shi|90|72|80|208|255
Sima Zhao|90|70|80|211|265
Yang Xiu|90|20|50|175|219
Hu Xin|30|60|30|170|210
Wang Kuang|40|55|40|160|200
Song Xian|25|70|25|165|205
Chen Jiao|80|30|60|170|237
Du Xi|70|30|60|170|225
Dong Heng|25|60|25|170|219
Wang Shuang|20|85|20|195|228
Huang Wan|65|30|70|141|200
Guo Huai|80|80|70|190|255
Ma Wan|30|70|30|165|211
Li Zhan|30|62|30|165|211
Zhang Heng|30|68|30|165|211
Dian Man|25|72|35|190|240
Cao Rui|80|50|80|204|239
Zhong Hui|95|70|60|225|264
Fu Gan|70|30|50|175|215
Chen Tai|75|72|65|200|260
Guo Yi|60|30|50|190|230
Lu Jian|30|60|30|165|210
Zhu Ling|55|76|50|165|225
Cao Shuang|40|50|40|205|249
Zhang Miao|60|40|70|150|205
Cheng Wu|70|30|40|200|250
Chen Xi|30|55|30|165|210
Lu Qian|60|65|60|165|230
Cao Zhi|90|25|80|192|232
Li Tong|45|76|60|168|209
Jia Hua|30|65|30|170|225
Tan Xiong|20|68|20|170|222
Han Xian|30|60|25|160|205
Fu Shiren|40|60|30|170|222
Cai He|25|60|25|175|208
Li Gui|50|40|40|165|208
Cai Zhong|25|60|25|175|208
Wang Can|85|20|70|177|217
Huo Jun|65|70|65|178|217
Liu Ba|85|20|60|180|222
Sun Liang|60|30|55|243|260
Sun Huan|60|72|65|195|234
Yang Ling|20|68|20|170|208
Sun Deng|75|30|80|209|241
Sun He|70|30|70|224|253
Sun Yi|50|70|55|184|210
Huan Cheng|30|60|30|170|210
Han Hao|60|60|50|165|225
Sun Yu|65|60|65|177|215
Quan Zong|70|72|70|180|247
Lu Ba|30|50|30|200|250
Xue Zong|75|20|60|175|243
Cheng Bing|75|20|60|170|225
Song Qian|40|70|40|175|220
Zhou Fang|85|40|60|190|250
Zhang Cheng|70|65|60|178|244
Zhang Xiu#2|65|30|55|180|239
Dong Xi|30|80|50|165|217
Yan Jun|75|30|70|177|240
Lu Ji|80|20|60|188|219
Zhuge Ke|90|60|60|203|253
Zhang Wen|80|20|70|193|230
Xie Jing|60|60|50|185|240
Cai Xun|40|60|40|170|220
Li Yi|40|55|40|170|220
Zhu Ran|70|80|65|182|249
Lu Fan|70|60|60|160|228
Ma Zhong#2|40|72|40|180|222
Yuan Pu|30|55|30|170|220
Fei Shi|70|20|50|175|240
Liu Bao|30|60|30|195|240
Zhang Zhu|30|65|30|195|240
Yang Yi|80|30|30|190|235
Zhang Ni|70|78|60|200|254
Pang Yi|40|60|40|165|225
Deng Zhi|85|50|70|180|251
Yang Hong#2|80|20|60|170|228
Deng Qian|30|60|30|175|225
Dong Yun|85|20|70|190|246
Guo Youzhi|70|20|60|190|245
Liu Xun|40|50|50|190|240
Fu Tong|45|75|50|195|222
Yin Mo|60|20|40|195|245
Xu Jing|75|15|75|150|222
Chen Shi|30|70|30|190|235
Zhang Yi|65|76|60|195|264
Lu Yi|30|60|30|175|220
Shang Guang|30|60|30|180|230
Wang Kang|50|40|60|180|230
Lu Kai|75|40|70|185|235
Gao Ding|30|72|40|180|225
`;

export function officerId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export const OFFICERS = ROSTER.trim().split('\n').map((line) => {
  const [name, int, war, cha, born, died] = line.split('|');
  return { id: officerId(name), name: name.replace(/#\d+$/, ''), int: +int, war: +war, cha: +cha, born: +born, died: +died };
});

// Blood relatives and sworn brothers: used for succession and loyalty.
export const FAMILIES = [
  ['Cao Cao', 'Cao Ren', 'Cao Hong', 'Cao Chun', 'Cao Pi', 'Cao Zhang', 'Cao Zhen', 'Cao Xiu', 'Xiahou Dun', 'Xiahou Yuan'],
  ['Sun Jian', 'Sun Ce', 'Sun Quan', 'Sun Jing', 'Wu Jing', 'Sun Shangxiang'],
  ['Liu Bei', 'Guan Yu', 'Zhang Fei', 'Guan Ping', 'Guan Xing', 'Zhang Bao'],
  ['Yuan Shao', 'Yuan Tan', 'Yuan Xi', 'Yuan Shang', 'Yuan Shu', 'Yuan Yin'],
  ['Ma Teng', 'Ma Chao', 'Ma Dai', 'Ma Xiu', 'Ma Tie'],
  ['Liu Yan', 'Liu Zhang'],
  ['Liu Biao', 'Liu Qi', 'Liu Zong'],
  ['Gongsun Du', 'Gongsun Kang', 'Gongsun Gong'],
  ['Gongsun Zan', 'Gongsun Yue', 'Gongsun Fan'],
  ['Shi Xie', 'Shi Hui', 'Shi Yi', 'Shi Wu'],
  ['Meng Huo', 'Zhu Rong', 'Meng You'],
  ['Yan Baihu', 'Yan Yu'],
  ['Mi Zhu', 'Mi Fang'],
  ['Kuai Liang', 'Kuai Yue'],
  ['Chen Gui', 'Chen Deng'],
  ['Zhang Lu', 'Zhang Wei'],
];
