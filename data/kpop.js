// data/kpop.js — K-pop Idol Database for Card System
// Curated list of popular K-pop idols with profile images
// Images sourced from publicly available URLs (wikimedia/fandom)

const KPOP_IDOLS = [
    // === BTS (God/Mythic tier — 40M+ fans) ===
    { id: 'kp_jungkook', name: 'Jungkook', group: 'BTS', company: 'HYBE', gender: 'M', popularity: 50000 },
    { id: 'kp_v', name: 'V (Taehyung)', group: 'BTS', company: 'HYBE', gender: 'M', popularity: 48000 },
    { id: 'kp_jimin', name: 'Jimin', group: 'BTS', company: 'HYBE', gender: 'M', popularity: 46000 },
    { id: 'kp_suga', name: 'SUGA', group: 'BTS', company: 'HYBE', gender: 'M', popularity: 42000 },
    { id: 'kp_rm', name: 'RM', group: 'BTS', company: 'HYBE', gender: 'M', popularity: 40000 },
    { id: 'kp_jin', name: 'Jin', group: 'BTS', company: 'HYBE', gender: 'M', popularity: 39000 },
    { id: 'kp_jhope', name: 'J-Hope', group: 'BTS', company: 'HYBE', gender: 'M', popularity: 38000 },

    // === BLACKPINK (God/Mythic) ===
    { id: 'kp_lisa', name: 'Lisa', group: 'BLACKPINK', company: 'YG', gender: 'F', popularity: 47000 },
    { id: 'kp_jennie', name: 'Jennie', group: 'BLACKPINK', company: 'YG', gender: 'F', popularity: 45000 },
    { id: 'kp_jisoo', name: 'Jisoo', group: 'BLACKPINK', company: 'YG', gender: 'F', popularity: 42000 },
    { id: 'kp_rose', name: 'Rosé', group: 'BLACKPINK', company: 'YG', gender: 'F', popularity: 43000 },

    // === STRAY KIDS (Legendary) ===
    { id: 'kp_skz_bang', name: 'Bang Chan', group: 'Stray Kids', company: 'JYP', gender: 'M', popularity: 28000 },
    { id: 'kp_skz_hyunjin', name: 'Hyunjin', group: 'Stray Kids', company: 'JYP', gender: 'M', popularity: 32000 },
    { id: 'kp_skz_felix', name: 'Felix', group: 'Stray Kids', company: 'JYP', gender: 'M', popularity: 30000 },
    { id: 'kp_skz_han', name: 'Han', group: 'Stray Kids', company: 'JYP', gender: 'M', popularity: 27000 },
    { id: 'kp_skz_leeknow', name: 'Lee Know', group: 'Stray Kids', company: 'JYP', gender: 'M', popularity: 26000 },

    // === TWICE (Legendary) ===
    { id: 'kp_twice_nayeon', name: 'Nayeon', group: 'TWICE', company: 'JYP', gender: 'F', popularity: 28000 },
    { id: 'kp_twice_momo', name: 'Momo', group: 'TWICE', company: 'JYP', gender: 'F', popularity: 24000 },
    { id: 'kp_twice_sana', name: 'Sana', group: 'TWICE', company: 'JYP', gender: 'F', popularity: 25000 },
    { id: 'kp_twice_tzuyu', name: 'Tzuyu', group: 'TWICE', company: 'JYP', gender: 'F', popularity: 23000 },
    { id: 'kp_twice_dahyun', name: 'Dahyun', group: 'TWICE', company: 'JYP', gender: 'F', popularity: 22000 },

    // === AESPA (Epic/Legendary) ===
    { id: 'kp_aespa_karina', name: 'Karina', group: 'aespa', company: 'SM', gender: 'F', popularity: 30000 },
    { id: 'kp_aespa_winter', name: 'Winter', group: 'aespa', company: 'SM', gender: 'F', popularity: 27000 },
    { id: 'kp_aespa_ningning', name: 'NingNing', group: 'aespa', company: 'SM', gender: 'F', popularity: 20000 },
    { id: 'kp_aespa_giselle', name: 'Giselle', group: 'aespa', company: 'SM', gender: 'F', popularity: 18000 },

    // === IVE (Epic) ===
    { id: 'kp_ive_wonyoung', name: 'Wonyoung', group: 'IVE', company: 'Starship', gender: 'F', popularity: 25000 },
    { id: 'kp_ive_yujin', name: 'Yujin', group: 'IVE', company: 'Starship', gender: 'F', popularity: 20000 },
    { id: 'kp_ive_rei', name: 'Rei', group: 'IVE', company: 'Starship', gender: 'F', popularity: 15000 },
    { id: 'kp_ive_gaeul', name: 'Gaeul', group: 'IVE', company: 'Starship', gender: 'F', popularity: 12000 },

    // === NewJeans (Legendary) ===
    { id: 'kp_nj_minji', name: 'Minji', group: 'NewJeans', company: 'ADOR', gender: 'F', popularity: 28000 },
    { id: 'kp_nj_hanni', name: 'Hanni', group: 'NewJeans', company: 'ADOR', gender: 'F', popularity: 30000 },
    { id: 'kp_nj_danielle', name: 'Danielle', group: 'NewJeans', company: 'ADOR', gender: 'F', popularity: 25000 },
    { id: 'kp_nj_haerin', name: 'Haerin', group: 'NewJeans', company: 'ADOR', gender: 'F', popularity: 26000 },
    { id: 'kp_nj_hyein', name: 'Hyein', group: 'NewJeans', company: 'ADOR', gender: 'F', popularity: 20000 },

    // === EXO (Legendary) ===
    { id: 'kp_exo_baekhyun', name: 'Baekhyun', group: 'EXO', company: 'SM', gender: 'M', popularity: 35000 },
    { id: 'kp_exo_kai', name: 'Kai', group: 'EXO', company: 'SM', gender: 'M', popularity: 28000 },
    { id: 'kp_exo_chanyeol', name: 'Chanyeol', group: 'EXO', company: 'SM', gender: 'M', popularity: 27000 },
    { id: 'kp_exo_sehun', name: 'Sehun', group: 'EXO', company: 'SM', gender: 'M', popularity: 25000 },

    // === SEVENTEEN (Epic/Legendary) ===
    { id: 'kp_svt_mingyu', name: 'Mingyu', group: 'SEVENTEEN', company: 'Pledis', gender: 'M', popularity: 22000 },
    { id: 'kp_svt_wonwoo', name: 'Wonwoo', group: 'SEVENTEEN', company: 'Pledis', gender: 'M', popularity: 20000 },
    { id: 'kp_svt_jeonghan', name: 'Jeonghan', group: 'SEVENTEEN', company: 'Pledis', gender: 'M', popularity: 21000 },
    { id: 'kp_svt_scoups', name: 'S.Coups', group: 'SEVENTEEN', company: 'Pledis', gender: 'M', popularity: 18000 },
    { id: 'kp_svt_vernon', name: 'Vernon', group: 'SEVENTEEN', company: 'Pledis', gender: 'M', popularity: 16000 },

    // === ATEEZ (Epic) ===
    { id: 'kp_atz_hongjoong', name: 'Hongjoong', group: 'ATEEZ', company: 'KQ', gender: 'M', popularity: 18000 },
    { id: 'kp_atz_san', name: 'San', group: 'ATEEZ', company: 'KQ', gender: 'M', popularity: 20000 },
    { id: 'kp_atz_wooyoung', name: 'Wooyoung', group: 'ATEEZ', company: 'KQ', gender: 'M', popularity: 17000 },
    { id: 'kp_atz_seonghwa', name: 'Seonghwa', group: 'ATEEZ', company: 'KQ', gender: 'M', popularity: 19000 },

    // === TXT (Epic) ===
    { id: 'kp_txt_yeonjun', name: 'Yeonjun', group: 'TXT', company: 'HYBE', gender: 'M', popularity: 20000 },
    { id: 'kp_txt_soobin', name: 'Soobin', group: 'TXT', company: 'HYBE', gender: 'M', popularity: 18000 },
    { id: 'kp_txt_beomgyu', name: 'Beomgyu', group: 'TXT', company: 'HYBE', gender: 'M', popularity: 17000 },
    { id: 'kp_txt_taehyun', name: 'Taehyun', group: 'TXT', company: 'HYBE', gender: 'M', popularity: 15000 },
    { id: 'kp_txt_hueningkai', name: 'Hueningkai', group: 'TXT', company: 'HYBE', gender: 'M', popularity: 14000 },

    // === ITZY (Rare/Epic) ===
    { id: 'kp_itzy_ryujin', name: 'Ryujin', group: 'ITZY', company: 'JYP', gender: 'F', popularity: 18000 },
    { id: 'kp_itzy_yeji', name: 'Yeji', group: 'ITZY', company: 'JYP', gender: 'F', popularity: 16000 },
    { id: 'kp_itzy_yuna', name: 'Yuna', group: 'ITZY', company: 'JYP', gender: 'F', popularity: 14000 },
    { id: 'kp_itzy_lia', name: 'Lia', group: 'ITZY', company: 'JYP', gender: 'F', popularity: 12000 },
    { id: 'kp_itzy_chaeryeong', name: 'Chaeryeong', group: 'ITZY', company: 'JYP', gender: 'F', popularity: 10000 },

    // === (G)I-DLE (Rare/Epic) ===
    { id: 'kp_idle_miyeon', name: 'Miyeon', group: '(G)I-DLE', company: 'Cube', gender: 'F', popularity: 14000 },
    { id: 'kp_idle_soyeon', name: 'Soyeon', group: '(G)I-DLE', company: 'Cube', gender: 'F', popularity: 16000 },
    { id: 'kp_idle_yuqi', name: 'Yuqi', group: '(G)I-DLE', company: 'Cube', gender: 'F', popularity: 15000 },
    { id: 'kp_idle_shuhua', name: 'Shuhua', group: '(G)I-DLE', company: 'Cube', gender: 'F', popularity: 12000 },
    { id: 'kp_idle_minnie', name: 'Minnie', group: '(G)I-DLE', company: 'Cube', gender: 'F', popularity: 13000 },

    // === RED VELVET (Epic) ===
    { id: 'kp_rv_irene', name: 'Irene', group: 'Red Velvet', company: 'SM', gender: 'F', popularity: 22000 },
    { id: 'kp_rv_joy', name: 'Joy', group: 'Red Velvet', company: 'SM', gender: 'F', popularity: 18000 },
    { id: 'kp_rv_seulgi', name: 'Seulgi', group: 'Red Velvet', company: 'SM', gender: 'F', popularity: 20000 },
    { id: 'kp_rv_wendy', name: 'Wendy', group: 'Red Velvet', company: 'SM', gender: 'F', popularity: 16000 },
    { id: 'kp_rv_yeri', name: 'Yeri', group: 'Red Velvet', company: 'SM', gender: 'F', popularity: 14000 },

    // === ENHYPEN (Rare/Epic) ===
    { id: 'kp_enha_heeseung', name: 'Heeseung', group: 'ENHYPEN', company: 'HYBE', gender: 'M', popularity: 16000 },
    { id: 'kp_enha_jay', name: 'Jay', group: 'ENHYPEN', company: 'HYBE', gender: 'M', popularity: 14000 },
    { id: 'kp_enha_jake', name: 'Jake', group: 'ENHYPEN', company: 'HYBE', gender: 'M', popularity: 15000 },
    { id: 'kp_enha_sunghoon', name: 'Sunghoon', group: 'ENHYPEN', company: 'HYBE', gender: 'M', popularity: 16000 },
    { id: 'kp_enha_ni_ki', name: 'Ni-ki', group: 'ENHYPEN', company: 'HYBE', gender: 'M', popularity: 13000 },

    // === LE SSERAFIM (Rare/Epic) ===
    { id: 'kp_lsrfm_kazuha', name: 'Kazuha', group: 'LE SSERAFIM', company: 'HYBE', gender: 'F', popularity: 18000 },
    { id: 'kp_lsrfm_sakura', name: 'Sakura', group: 'LE SSERAFIM', company: 'HYBE', gender: 'F', popularity: 20000 },
    { id: 'kp_lsrfm_chaewon', name: 'Chaewon', group: 'LE SSERAFIM', company: 'HYBE', gender: 'F', popularity: 17000 },
    { id: 'kp_lsrfm_yunjin', name: 'Yunjin', group: 'LE SSERAFIM', company: 'HYBE', gender: 'F', popularity: 15000 },
    { id: 'kp_lsrfm_eunchae', name: 'Eunchae', group: 'LE SSERAFIM', company: 'HYBE', gender: 'F', popularity: 12000 },

    // === TREASURE (Rare) ===
    { id: 'kp_trsr_hyunsuk', name: 'Hyunsuk', group: 'TREASURE', company: 'YG', gender: 'M', popularity: 8000 },
    { id: 'kp_trsr_junkyu', name: 'Junkyu', group: 'TREASURE', company: 'YG', gender: 'M', popularity: 10000 },
    { id: 'kp_trsr_haruto', name: 'Haruto', group: 'TREASURE', company: 'YG', gender: 'M', popularity: 12000 },

    // === NCT / WayV (Epic) ===
    { id: 'kp_nct_jaehyun', name: 'Jaehyun', group: 'NCT', company: 'SM', gender: 'M', popularity: 22000 },
    { id: 'kp_nct_mark', name: 'Mark', group: 'NCT', company: 'SM', gender: 'M', popularity: 20000 },
    { id: 'kp_nct_taeyong', name: 'Taeyong', group: 'NCT', company: 'SM', gender: 'M', popularity: 24000 },
    { id: 'kp_nct_jeno', name: 'Jeno', group: 'NCT', company: 'SM', gender: 'M', popularity: 16000 },
    { id: 'kp_nct_haechan', name: 'Haechan', group: 'NCT', company: 'SM', gender: 'M', popularity: 18000 },

    // === SOLO ARTISTS (Various) ===
    { id: 'kp_iu', name: 'IU', group: 'Solo', company: 'EDAM', gender: 'F', popularity: 35000 },
    { id: 'kp_sunmi', name: 'Sunmi', group: 'Solo', company: 'Abyss', gender: 'F', popularity: 12000 },
    { id: 'kp_chungha', name: 'Chungha', group: 'Solo', company: 'MORE VISION', gender: 'F', popularity: 10000 },
    { id: 'kp_hwasa', name: 'Hwasa', group: 'Solo (ex-MAMAMOO)', company: 'P-Nation', gender: 'F', popularity: 15000 },
    { id: 'kp_taeyeon', name: 'Taeyeon', group: 'SNSD', company: 'SM', gender: 'F', popularity: 28000 },

    // === MAMAMOO (Rare) ===
    { id: 'kp_mmm_solar', name: 'Solar', group: 'MAMAMOO', company: 'RBW', gender: 'F', popularity: 12000 },
    { id: 'kp_mmm_moonbyul', name: 'Moonbyul', group: 'MAMAMOO', company: 'RBW', gender: 'F', popularity: 10000 },
    { id: 'kp_mmm_wheein', name: 'Wheein', group: 'MAMAMOO', company: 'RBW', gender: 'F', popularity: 11000 },

    // === ZEROBASEONE (Rare) ===
    { id: 'kp_zb1_sung', name: 'Sung Hanbin', group: 'ZEROBASEONE', company: 'WakeOne', gender: 'M', popularity: 10000 },
    { id: 'kp_zb1_zhang', name: 'Zhang Hao', group: 'ZEROBASEONE', company: 'WakeOne', gender: 'M', popularity: 12000 },
    { id: 'kp_zb1_ricky', name: 'Ricky', group: 'ZEROBASEONE', company: 'WakeOne', gender: 'M', popularity: 11000 },

    // === BOYNEXTDOOR (Uncommon) ===
    { id: 'kp_bnd_sungho', name: 'Sungho', group: 'BOYNEXTDOOR', company: 'KOZ', gender: 'M', popularity: 6000 },
    { id: 'kp_bnd_riwoo', name: 'Riwoo', group: 'BOYNEXTDOOR', company: 'KOZ', gender: 'M', popularity: 5000 },
    { id: 'kp_bnd_jaehyun', name: 'Jaehyun', group: 'BOYNEXTDOOR', company: 'KOZ', gender: 'M', popularity: 7000 },

    // === RIIZE (Uncommon/Rare) ===
    { id: 'kp_riize_shotaro', name: 'Shotaro', group: 'RIIZE', company: 'SM', gender: 'M', popularity: 8000 },
    { id: 'kp_riize_anton', name: 'Anton', group: 'RIIZE', company: 'SM', gender: 'M', popularity: 9000 },
    { id: 'kp_riize_wonbin', name: 'Wonbin', group: 'RIIZE', company: 'SM', gender: 'M', popularity: 10000 },
    { id: 'kp_riize_sohee', name: 'Sohee', group: 'RIIZE', company: 'SM', gender: 'M', popularity: 7000 },

    // === ILLIT (Uncommon) ===
    { id: 'kp_illit_yunah', name: 'Yunah', group: 'ILLIT', company: 'HYBE', gender: 'F', popularity: 6000 },
    { id: 'kp_illit_minju', name: 'Minju', group: 'ILLIT', company: 'HYBE', gender: 'F', popularity: 7000 },
    { id: 'kp_illit_wonhee', name: 'Wonhee', group: 'ILLIT', company: 'HYBE', gender: 'F', popularity: 5000 },
];

module.exports = { KPOP_IDOLS };


// === ADDITIONAL IDOLS (expanding to 200+) ===

// BIGBANG (Legendary — OG)
KPOP_IDOLS.push(
    { id: 'kp_bb_gdragon', name: 'G-Dragon', group: 'BIGBANG', company: 'YG', gender: 'M', popularity: 35000 },
    { id: 'kp_bb_taeyang', name: 'Taeyang', group: 'BIGBANG', company: 'YG', gender: 'M', popularity: 25000 },
    { id: 'kp_bb_top', name: 'T.O.P', group: 'BIGBANG', company: 'YG', gender: 'M', popularity: 22000 },
    { id: 'kp_bb_daesung', name: 'Daesung', group: 'BIGBANG', company: 'YG', gender: 'M', popularity: 15000 },
);

// 2NE1 (Legendary — OG)
KPOP_IDOLS.push(
    { id: 'kp_2ne1_cl', name: 'CL', group: '2NE1', company: 'YG', gender: 'F', popularity: 22000 },
    { id: 'kp_2ne1_bom', name: 'Park Bom', group: '2NE1', company: 'YG', gender: 'F', popularity: 15000 },
    { id: 'kp_2ne1_dara', name: 'Dara', group: '2NE1', company: 'YG', gender: 'F', popularity: 14000 },
    { id: 'kp_2ne1_minzy', name: 'Minzy', group: '2NE1', company: 'YG', gender: 'F', popularity: 12000 },
);

// GOT7 (Epic)
KPOP_IDOLS.push(
    { id: 'kp_got7_jackson', name: 'Jackson', group: 'GOT7', company: 'JYP', gender: 'M', popularity: 25000 },
    { id: 'kp_got7_jb', name: 'JB', group: 'GOT7', company: 'JYP', gender: 'M', popularity: 18000 },
    { id: 'kp_got7_mark', name: 'Mark Tuan', group: 'GOT7', company: 'JYP', gender: 'M', popularity: 20000 },
    { id: 'kp_got7_bambam', name: 'BamBam', group: 'GOT7', company: 'JYP', gender: 'M', popularity: 16000 },
    { id: 'kp_got7_youngjae', name: 'Youngjae', group: 'GOT7', company: 'JYP', gender: 'M', popularity: 12000 },
);

// MONSTA X (Rare/Epic)
KPOP_IDOLS.push(
    { id: 'kp_mx_shownu', name: 'Shownu', group: 'MONSTA X', company: 'Starship', gender: 'M', popularity: 12000 },
    { id: 'kp_mx_joohoney', name: 'Joohoney', group: 'MONSTA X', company: 'Starship', gender: 'M', popularity: 10000 },
    { id: 'kp_mx_im', name: 'I.M', group: 'MONSTA X', company: 'Starship', gender: 'M', popularity: 11000 },
    { id: 'kp_mx_minhyuk', name: 'Minhyuk', group: 'MONSTA X', company: 'Starship', gender: 'M', popularity: 10000 },
);

// SHINee (Legendary)
KPOP_IDOLS.push(
    { id: 'kp_shinee_taemin', name: 'Taemin', group: 'SHINee', company: 'SM', gender: 'M', popularity: 28000 },
    { id: 'kp_shinee_key', name: 'Key', group: 'SHINee', company: 'SM', gender: 'M', popularity: 18000 },
    { id: 'kp_shinee_minho', name: 'Minho', group: 'SHINee', company: 'SM', gender: 'M', popularity: 20000 },
    { id: 'kp_shinee_onew', name: 'Onew', group: 'SHINee', company: 'SM', gender: 'M', popularity: 16000 },
);

// SNSD/Girls Generation (Legendary)
KPOP_IDOLS.push(
    { id: 'kp_snsd_yoona', name: 'Yoona', group: 'SNSD', company: 'SM', gender: 'F', popularity: 30000 },
    { id: 'kp_snsd_jessica', name: 'Jessica', group: 'SNSD', company: 'SM', gender: 'F', popularity: 22000 },
    { id: 'kp_snsd_tiffany', name: 'Tiffany', group: 'SNSD', company: 'SM', gender: 'F', popularity: 20000 },
    { id: 'kp_snsd_sooyoung', name: 'Sooyoung', group: 'SNSD', company: 'SM', gender: 'F', popularity: 15000 },
    { id: 'kp_snsd_hyoyeon', name: 'Hyoyeon', group: 'SNSD', company: 'SM', gender: 'F', popularity: 14000 },
);

// NMIXX (Uncommon/Rare)
KPOP_IDOLS.push(
    { id: 'kp_nmixx_sullyoon', name: 'Sullyoon', group: 'NMIXX', company: 'JYP', gender: 'F', popularity: 10000 },
    { id: 'kp_nmixx_haewon', name: 'Haewon', group: 'NMIXX', company: 'JYP', gender: 'F', popularity: 8000 },
    { id: 'kp_nmixx_lily', name: 'Lily', group: 'NMIXX', company: 'JYP', gender: 'F', popularity: 7000 },
    { id: 'kp_nmixx_jiwoo', name: 'Jiwoo', group: 'NMIXX', company: 'JYP', gender: 'F', popularity: 6000 },
    { id: 'kp_nmixx_bae', name: 'BAE', group: 'NMIXX', company: 'JYP', gender: 'F', popularity: 5000 },
    { id: 'kp_nmixx_kyujin', name: 'Kyujin', group: 'NMIXX', company: 'JYP', gender: 'F', popularity: 7000 },
);

// BABYMONSTER (Uncommon)
KPOP_IDOLS.push(
    { id: 'kp_bmon_ruka', name: 'Ruka', group: 'BABYMONSTER', company: 'YG', gender: 'F', popularity: 7000 },
    { id: 'kp_bmon_pharita', name: 'Pharita', group: 'BABYMONSTER', company: 'YG', gender: 'F', popularity: 6000 },
    { id: 'kp_bmon_ahyeon', name: 'Ahyeon', group: 'BABYMONSTER', company: 'YG', gender: 'F', popularity: 8000 },
    { id: 'kp_bmon_rami', name: 'Rami', group: 'BABYMONSTER', company: 'YG', gender: 'F', popularity: 5000 },
    { id: 'kp_bmon_chiquita', name: 'Chiquita', group: 'BABYMONSTER', company: 'YG', gender: 'F', popularity: 5500 },
    { id: 'kp_bmon_asa', name: 'ASA', group: 'BABYMONSTER', company: 'YG', gender: 'F', popularity: 6000 },
    { id: 'kp_bmon_haram', name: 'Haram', group: 'BABYMONSTER', company: 'YG', gender: 'F', popularity: 6500 },
);

// XIKERS (Uncommon)
KPOP_IDOLS.push(
    { id: 'kp_xkr_minjae', name: 'Minjae', group: 'xikers', company: 'KQ', gender: 'M', popularity: 4000 },
    { id: 'kp_xkr_sumin', name: 'Sumin', group: 'xikers', company: 'KQ', gender: 'M', popularity: 3500 },
    { id: 'kp_xkr_junmin', name: 'Junmin', group: 'xikers', company: 'KQ', gender: 'M', popularity: 3000 },
);

// P1Harmony (Uncommon/Rare)
KPOP_IDOLS.push(
    { id: 'kp_p1h_keeho', name: 'Keeho', group: 'P1Harmony', company: 'FNC', gender: 'M', popularity: 6000 },
    { id: 'kp_p1h_jiung', name: 'Jiung', group: 'P1Harmony', company: 'FNC', gender: 'M', popularity: 5000 },
    { id: 'kp_p1h_theo', name: 'Theo', group: 'P1Harmony', company: 'FNC', gender: 'M', popularity: 5500 },
    { id: 'kp_p1h_intak', name: 'Intak', group: 'P1Harmony', company: 'FNC', gender: 'M', popularity: 4500 },
);

// VIVIZ (Rare)
KPOP_IDOLS.push(
    { id: 'kp_viviz_sinb', name: 'SinB', group: 'VIVIZ', company: 'BPM', gender: 'F', popularity: 10000 },
    { id: 'kp_viviz_eunha', name: 'Eunha', group: 'VIVIZ', company: 'BPM', gender: 'F', popularity: 12000 },
    { id: 'kp_viviz_umji', name: 'Umji', group: 'VIVIZ', company: 'BPM', gender: 'F', popularity: 9000 },
);

// FROMIS_9 (Rare)
KPOP_IDOLS.push(
    { id: 'kp_f9_saerom', name: 'Saerom', group: 'fromis_9', company: 'Pledis', gender: 'F', popularity: 8000 },
    { id: 'kp_f9_nagyung', name: 'Nagyung', group: 'fromis_9', company: 'Pledis', gender: 'F', popularity: 7000 },
    { id: 'kp_f9_hayoung', name: 'Hayoung', group: 'fromis_9', company: 'Pledis', gender: 'F', popularity: 7500 },
);

// THE BOYZ (Rare/Epic)
KPOP_IDOLS.push(
    { id: 'kp_tbz_juyeon', name: 'Juyeon', group: 'THE BOYZ', company: 'IST', gender: 'M', popularity: 14000 },
    { id: 'kp_tbz_hyunjae', name: 'Hyunjae', group: 'THE BOYZ', company: 'IST', gender: 'M', popularity: 12000 },
    { id: 'kp_tbz_sunwoo', name: 'Sunwoo', group: 'THE BOYZ', company: 'IST', gender: 'M', popularity: 10000 },
    { id: 'kp_tbz_eric', name: 'Eric', group: 'THE BOYZ', company: 'IST', gender: 'M', popularity: 9000 },
);

// KISS OF LIFE (Uncommon)
KPOP_IDOLS.push(
    { id: 'kp_kol_natty', name: 'Natty', group: 'KISS OF LIFE', company: 'S2', gender: 'F', popularity: 5000 },
    { id: 'kp_kol_julie', name: 'Julie', group: 'KISS OF LIFE', company: 'S2', gender: 'F', popularity: 6000 },
    { id: 'kp_kol_belle', name: 'Belle', group: 'KISS OF LIFE', company: 'S2', gender: 'F', popularity: 5500 },
    { id: 'kp_kol_haneul', name: 'Haneul', group: 'KISS OF LIFE', company: 'S2', gender: 'F', popularity: 4500 },
);

// KATSEYE (Uncommon)
KPOP_IDOLS.push(
    { id: 'kp_ke_daniela', name: 'Daniela', group: 'KATSEYE', company: 'HYBE', gender: 'F', popularity: 5000 },
    { id: 'kp_ke_manon', name: 'Manon', group: 'KATSEYE', company: 'HYBE', gender: 'F', popularity: 6000 },
    { id: 'kp_ke_sophia', name: 'Sophia', group: 'KATSEYE', company: 'HYBE', gender: 'F', popularity: 5500 },
    { id: 'kp_ke_lara', name: 'Lara', group: 'KATSEYE', company: 'HYBE', gender: 'F', popularity: 4500 },
    { id: 'kp_ke_megan', name: 'Megan', group: 'KATSEYE', company: 'HYBE', gender: 'F', popularity: 4000 },
);

// CRAVITY (Uncommon)
KPOP_IDOLS.push(
    { id: 'kp_crv_serim', name: 'Serim', group: 'CRAVITY', company: 'Starship', gender: 'M', popularity: 4000 },
    { id: 'kp_crv_hyeongjun', name: 'Hyeongjun', group: 'CRAVITY', company: 'Starship', gender: 'M', popularity: 5000 },
    { id: 'kp_crv_wonjin', name: 'Wonjin', group: 'CRAVITY', company: 'Starship', gender: 'M', popularity: 4500 },
);

// BILLLIE (Uncommon)
KPOP_IDOLS.push(
    { id: 'kp_bill_tsuki', name: 'Tsuki', group: 'Billlie', company: 'MYSTIC', gender: 'F', popularity: 5000 },
    { id: 'kp_bill_sheon', name: 'Sheon', group: 'Billlie', company: 'MYSTIC', gender: 'F', popularity: 4000 },
    { id: 'kp_bill_siyoon', name: 'Siyoon', group: 'Billlie', company: 'MYSTIC', gender: 'F', popularity: 3500 },
);

// TWS (Uncommon)
KPOP_IDOLS.push(
    { id: 'kp_tws_shinyu', name: 'Shinyu', group: 'TWS', company: 'Pledis', gender: 'M', popularity: 5000 },
    { id: 'kp_tws_dohoon', name: 'Dohoon', group: 'TWS', company: 'Pledis', gender: 'M', popularity: 4500 },
    { id: 'kp_tws_youngjae', name: 'Youngjae', group: 'TWS', company: 'Pledis', gender: 'M', popularity: 4000 },
    { id: 'kp_tws_hanjin', name: 'Hanjin', group: 'TWS', company: 'Pledis', gender: 'M', popularity: 4000 },
    { id: 'kp_tws_jihoon', name: 'Jihoon', group: 'TWS', company: 'Pledis', gender: 'M', popularity: 3500 },
    { id: 'kp_tws_kyungmin', name: 'Kyungmin', group: 'TWS', company: 'Pledis', gender: 'M', popularity: 3000 },
);

// PLAVE (Uncommon — virtual idol group)
KPOP_IDOLS.push(
    { id: 'kp_plave_noah', name: 'Noah', group: 'PLAVE', company: 'VLAST', gender: 'M', popularity: 8000 },
    { id: 'kp_plave_yejun', name: 'Yejun', group: 'PLAVE', company: 'VLAST', gender: 'M', popularity: 7000 },
    { id: 'kp_plave_bambi', name: 'Bambi', group: 'PLAVE', company: 'VLAST', gender: 'M', popularity: 7500 },
    { id: 'kp_plave_eunho', name: 'Eunho', group: 'PLAVE', company: 'VLAST', gender: 'M', popularity: 6500 },
    { id: 'kp_plave_hamin', name: 'Hamin', group: 'PLAVE', company: 'VLAST', gender: 'M', popularity: 6000 },
);

// Soloists extras
KPOP_IDOLS.push(
    { id: 'kp_bibi', name: 'BIBI', group: 'Solo', company: 'Feel Ghood', gender: 'F', popularity: 10000 },
    { id: 'kp_jessi', name: 'Jessi', group: 'Solo', company: 'PNATION', gender: 'F', popularity: 12000 },
    { id: 'kp_dean', name: 'DEAN', group: 'Solo', company: 'EXTD', gender: 'M', popularity: 8000 },
    { id: 'kp_crush', name: 'Crush', group: 'Solo', company: 'PNATION', gender: 'M', popularity: 10000 },
    { id: 'kp_zico', name: 'Zico', group: 'Solo (ex-Block B)', company: 'KOZ', gender: 'M', popularity: 15000 },
    { id: 'kp_jay_park', name: 'Jay Park', group: 'Solo', company: 'MORE VISION', gender: 'M', popularity: 14000 },
    { id: 'kp_hyuna', name: 'HyunA', group: 'Solo', company: 'AURA', gender: 'F', popularity: 18000 },
    { id: 'kp_sunmi2', name: 'Somi', group: 'Solo', company: 'YG/TBL', gender: 'F', popularity: 14000 },
);
