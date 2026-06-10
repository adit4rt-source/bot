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
