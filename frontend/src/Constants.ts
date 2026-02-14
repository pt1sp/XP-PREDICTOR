export const STAGES = [
  "ユノハナ大渓谷",
  "ゴンズイ地区",
  "ヤガラ市場",
  "マテガイ放水路",
  "ナメロウ金属",
  "マサバ海峡大橋",
  "キンメダイ美術館",
  "マヒマヒリゾート&スパ",
  "海女美術大学",
  "チョウザメ造船",
  "ザトウマーケット",
  "スメーシーワールド",
  "クサヤ温泉",
  "ヒラメが丘団地",
  "ナンプラー遺跡",
  "マンタマリア号",
  "タラポートショッピングパーク",
  "コンブトラック",
  "タカアシ経済特区",
  "オヒョウ海運",
  "バイガイ亭",
  "ネギトロ炭鉱",
  "カジキ空港",
  "リュウグウターミナル"
] as const;

export type Stage = typeof STAGES[number];

export type WeaponCategory = {
  key: string;
  label: string;
  weapons: string[];
};

export const WEAPON_CATEGORIES: WeaponCategory[] = [
  {
    key: "shooter",
    label: "シューター",
    weapons: [
      "わかばシューター",
      "もみじシューター",
      "スプラシューター",
      "スプラシューターコラボ",
      "スプラシューター煌",
      "スペースシューター",
      "スペースシューターコラボ",
      "プライムシューター",
      "プライムシューターコラボ",
      "プライムシューターFRZN",
      ".52ガロン",
      ".52ガロンデコ",
      ".96ガロン",
      ".96ガロンデコ",
      ".96ガロン爪",
      "ジェットスイーパー",
      "ジェットスイーパーカスタム",
      "ジェットスイーパーCOBR",
      "ボールドマーカー",
      "ボールドマーカーネオ",
      "シャープマーカー",
      "シャープマーカーネオ",
      "シャープマーカーGECK",
      "N-ZAP85",
      "N-ZAP89",
      "プロモデラーRG",
      "プロモデラーMG",
      "プロモデラー彩",
      "ボトルガイザー",
      "ボトルガイザーフォイル",
      "L3リールガン",
      "L3リールガンD",
      "L3リールガン箔",
      "H3リールガン",
      "H3リールガンD",
      "H3リールガンSNAK",
    ],
  },
  {
    key: "blaster",
    label: "ブラスター",
    weapons: [
      "ホットブラスター",
      "ホットブラスターカスタム",
      "ホットブラスター艶",
      "ロングブラスター",
      "ロングブラスターカスタム",
      "ラピッドブラスター",
      "ラピッドブラスターデコ",
      "Rブラスターエリート",
      "Rブラスターエリートデコ",
      "RブラスターエリートWNTR",
      "ノヴァブラスター",
      "ノヴァブラスターネオ",
      "クラッシュブラスター",
      "クラッシュブラスターネオ",
      "S-BLAST91",
      "S-BLAST92",
    ],
  },
  {
    key: "roller",
    label: "ローラー",
    weapons: [
      "スプラローラー",
      "スプラローラーコラボ",
      "カーボンローラー",
      "カーボンローラーデコ",
      "カーボンローラーANGL",
      "ヴァリアブルローラー",
      "ヴァリアブルローラーフォイル",
      "ダイナモローラー",
      "ダイナモローラーテスラ",
      "ダイナモローラー冥",
      "ワイドローラー",
      "ワイドローラーコラボ",
      "ワイドローラー惑",
    ],
  },
  {
    key: "brush",
    label: "フデ",
    weapons: [
      "パブロ",
      "パブロヒュー",
      "ホクサイ",
      "ホクサイヒュー",
      "ホクサイ彗",
      "フィンセント",
      "フィンセントヒュー",
      "フィンセントBRNZ",
    ],
  },
  {
    key: "charger",
    label: "チャージャー",
    weapons: [
      "スプラチャージャー",
      "スプラチャージャーコラボ",
      "スプラチャージャーFRST",
      "スプラスコープ",
      "スプラスコープコラボ",
      "スプラスコープFRST",
      "リッター4K",
      "リッター4Kカスタム",
      "4Kスコープ",
      "4Kスコープカスタム",
      "ソイチューバー",
      "ソイチューバーカスタム",
      "スクイックリンα",
      "スクイックリンβ",
      "14式竹筒銃甲",
      "14式竹筒銃乙",
      "R-PEN／5H",
      "R-PEN／5B",
    ],
  },
  {
    key: "slosher",
    label: "スロッシャー",
    weapons: [
      "バケットスロッシャー",
      "バケットスロッシャーデコ",
      "ヒッセン",
      "ヒッセンヒュー",
      "ヒッセンASH",
      "スクリュースロッシャー",
      "スクリュースロッシャーネオ",
      "オーバーフロッシャー",
      "オーバーフロッシャーデコ",
      "エクスプロッシャー",
      "エクスプロッシャーカスタム",
      "モップリン",
      "モップリンＤ",
      "モップリン角",
    ],
  },
  {
    key: "spinner",
    label: "スピナー",
    weapons: [
      "スプラスピナー",
      "スプラスピナーコラボ",
      "スプラスピナーPYTN",
      "バレルスピナー",
      "バレルスピナーデコ",
      "ハイドラント",
      "ハイドラントカスタム",
      "ハイドラント圧",
      "クーゲルシュライバー",
      "クーゲルシュライバーヒュー",
      "ノーチラス47",
      "ノーチラス79",
      "イグザミナー",
      "イグザミナーヒュー",
    ],
  },
  {
    key: "dualies",
    label: "マニューバー",
    weapons: [
      "スプラマニューバー",
      "スプラマニューバーコラボ",
      "スプラマニューバー耀",
      "スパッタリー",
      "スパッタリーヒュー",
      "スパッタリーOWL",
      "デュアルスイーパー",
      "デュアルスイーパーカスタム",
      "デュアルスイーパー蹄",
      "ケルビン525",
      "ケルビン525デコ",
      "クアッドホッパーブラック",
      "クアッドホッパーホワイト",
      "ガエンFF",
      "ガエンFFカスタム",
    ],
  },
  {
    key: "brella",
    label: "シェルター",
    weapons: [
      "パラシェルター",
      "パラシェルターソレーラ",
      "キャンピングシェルター",
      "キャンピングシェルターソレーラ",
      "キャンピングシェルターCREM",
      "スパイガジェット",
      "スパイガジェットソレーラ",
      "スパイガジェット繚",
      "24式張替傘甲",
      "24式張替傘乙",
    ],
  },
  {
    key: "stringer",
    label: "ストリンガー",
    weapons: [
      "トライストリンガー",
      "トライストリンガーコラボ",
      "トライストリンガー燈",
      "LACT-450",
      "LACT-450デコ",
      "LACT-450MILK",
      "フルイドV",
      "フルイドVカスタム",
    ],
  },
  {
    key: "splatana",
    label: "ワイパー",
    weapons: [
      "ドライブワイパー",
      "ドライブワイパーデコ",
      "ドライブワイパーRUST",
      "ジムワイパー",
      "ジムワイパーヒュー",
      "ジムワイパー封",
      "デンタルワイパーミント",
      "デンタルワイパースミ",
    ],
  },
];


export function getAllWeapons(): string[] {
  return WEAPON_CATEGORIES.flatMap(category => category.weapons);
}

export function getWeaponCategory(weaponName: string): WeaponCategory | undefined {
  return WEAPON_CATEGORIES.find(category => 
    category.weapons.includes(weaponName)
  );
}
export function getStageImagePath(stageName: string): string | undefined {
  if (!stageName) return undefined;
  const fileName = `${stageName}.png`;
  return `/assets/stages/${fileName}`;
}

export function getWeaponImagePath(weaponName: string): string | undefined {
  if (!weaponName) return undefined;
  const fileName = weaponName.replace(/^\./, '_') + '.png';
  return `/assets/weapons/${fileName}`;
}
