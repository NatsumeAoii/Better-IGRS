import type { Language } from '@/shared/types';

export interface GuideCopy {
  summary: string;
  sections: Array<{ label: string; text: string }>;
  watchFor: string[];
}

/**
 * Rating IDs per igrs.meta.json:
 *   7 = 3+, 4 = 7+, 5 = 13+, 28 = 15+, 6 = 18+, 35 = RC (Refused Classification)
 */
export const RATING_GUIDE_COPY: Record<Language, Record<number, GuideCopy>> = {
  en: {
    7: {
      summary: 'Suitable for children aged 3 and above. Content is generally very mild and safe for young children.',
      sections: [
        { label: 'Violence & Gore', text: 'No violence, blood, or gore is permitted. Any conflict must be entirely abstract or comical.' },
        { label: 'Language', text: 'No coarse language or profanity is allowed.' },
        { label: 'Sexual Content', text: 'No sexual references, nudity, or suggestive themes are present.' },
        { label: 'Drugs & Alcohol', text: 'No references to drugs, alcohol, or tobacco.' }
      ],
      watchFor: ['Completely Safe', 'Family Friendly', 'Educational']
    },
    4: {
      summary: 'Suitable for children aged 7 and above. Content may contain very mild frightening elements or cartoon violence.',
      sections: [
        { label: 'Violence', text: 'May feature very mild, non-realistic cartoon or fantasy violence. No blood or realistic injuries are allowed.' },
        { label: 'Frightening Elements', text: 'May contain mild scary situations or monsters, but nothing genuinely terrifying.' },
        { label: 'Language', text: 'Language remains mild. No strong profanity is permitted.' }
      ],
      watchFor: ['Mild Cartoon Violence', 'Mild Scary Elements']
    },
    5: {
      summary: 'Suitable for teenagers aged 13 and above. Content may begin to include more realistic violence and mild language.',
      sections: [
        { label: 'Violence', text: 'May contain moderate fantasy violence or mild realistic violence. Blood may be shown minimally but no gore.' },
        { label: 'Language', text: 'Mild coarse language and moderate profanity may be present.' },
        { label: 'Themes', text: 'May include mild suggestive themes, but no explicit sexual content or nudity.' },
        { label: 'Substances', text: 'May contain mild references to alcohol or tobacco, but no illicit drug use.' }
      ],
      watchFor: ['Fantasy Violence', 'Mild Language', 'Suggestive Themes']
    },
    28: {
      summary: 'Suitable for older teenagers aged 15 and above. Content is generally mature and requires some discretion.',
      sections: [
        { label: 'Violence & Gore', text: 'May contain realistic violence with visible blood and moderate injury details. No excessive gore.' },
        { label: 'Sexual Content', text: 'May include moderate sexual references, suggestive dialogue, and partial nudity (non-explicit).' },
        { label: 'Language', text: 'Strong language and frequent use of profanity are permitted.' },
        { label: 'Themes', text: 'Can deal with mature themes, horror, and substance use.' }
      ],
      watchFor: ['Realistic Violence', 'Strong Language', 'Partial Nudity', 'Substance Use']
    },
    6: {
      summary: 'Restricted to adults aged 18 and above. Content is highly explicit and unsuitable for minors.',
      sections: [
        { label: 'Violence & Gore', text: 'May contain intense, frequent, and realistic violence, including dismemberment, extreme gore, and cruelty.' },
        { label: 'Sexual Content', text: 'May feature explicit sexual content, full nudity, and highly suggestive adult themes.' },
        { label: 'Substances & Gambling', text: 'May depict the use of illicit drugs, addiction themes, and real-money gambling simulations.' },
        { label: 'Language', text: 'Heavy, unrestricted use of strong language and slurs.' }
      ],
      watchFor: ['Intense Violence & Gore', 'Explicit Sexual Content', 'Real Gambling', 'Illicit Drugs']
    },
    35: {
      summary: 'Rating Classification pending or currently unrated by the board.',
      sections: [
        { label: 'Warning', text: 'This game has not been officially rated by the IGRS board. Player discretion is strongly advised as it may contain completely unrestricted adult content.' },
        { label: 'Status', text: 'The game is either awaiting review or falls outside standard classification boundaries.' }
      ],
      watchFor: ['Pending Classification', 'Unrestricted Content']
    }
  },
  id: {
    7: {
      summary: 'Cocok untuk anak usia 3 tahun ke atas. Konten umumnya sangat ringan dan aman untuk anak kecil.',
      sections: [
        { label: 'Kekerasan & Darah', text: 'Tidak ada kekerasan, darah, atau gore yang diizinkan. Setiap konflik harus sepenuhnya abstrak atau bersifat komedi.' },
        { label: 'Bahasa', text: 'Tidak diperbolehkan menggunakan bahasa kasar atau kata-kata kotor.' },
        { label: 'Konten Seksual', text: 'Tidak ada referensi seksual, ketelanjangan, atau tema sugestif.' },
        { label: 'Obat & Alkohol', text: 'Tidak ada referensi tentang obat-obatan, alkohol, atau tembakau.' }
      ],
      watchFor: ['Sangat Aman', 'Ramah Keluarga', 'Edukasi']
    },
    4: {
      summary: 'Cocok untuk anak usia 7 tahun ke atas. Konten mungkin mengandung elemen menakutkan yang sangat ringan atau kekerasan kartun.',
      sections: [
        { label: 'Kekerasan', text: 'Mungkin menampilkan kekerasan kartun atau fantasi yang sangat ringan dan tidak realistis. Darah atau cedera realistis tidak diizinkan.' },
        { label: 'Elemen Menakutkan', text: 'Mungkin mengandung situasi atau monster yang sedikit menakutkan, tetapi tidak ada yang benar-benar mengerikan.' },
        { label: 'Bahasa', text: 'Bahasa tetap ringan. Kata-kata kotor yang kuat tidak diizinkan.' }
      ],
      watchFor: ['Kekerasan Kartun Ringan', 'Elemen Menakutkan Ringan']
    },
    5: {
      summary: 'Cocok untuk remaja usia 13 tahun ke atas. Konten mulai dapat mencakup kekerasan yang lebih realistis dan bahasa yang cukup kasar.',
      sections: [
        { label: 'Kekerasan', text: 'Mungkin mengandung kekerasan fantasi tingkat menengah atau kekerasan realistis ringan. Darah mungkin ditampilkan secara minimal tanpa gore.' },
        { label: 'Bahasa', text: 'Bahasa kasar ringan dan kata-kata kotor tingkat menengah mungkin muncul.' },
        { label: 'Tema', text: 'Mungkin termasuk tema sugestif ringan, tetapi tidak ada konten seksual eksplisit atau ketelanjangan.' },
        { label: 'Zat Adiktif', text: 'Mungkin mengandung referensi ringan terhadap alkohol atau tembakau, tetapi tidak ada penggunaan obat terlarang.' }
      ],
      watchFor: ['Kekerasan Fantasi', 'Bahasa Ringan', 'Tema Sugestif']
    },
    28: {
      summary: 'Cocok untuk remaja yang lebih tua usia 15 tahun ke atas. Konten umumnya bersifat dewasa dan membutuhkan kebijaksanaan pemain.',
      sections: [
        { label: 'Kekerasan & Darah', text: 'Mungkin mengandung kekerasan realistis dengan darah yang terlihat dan detail cedera menengah. Tidak ada gore berlebihan.' },
        { label: 'Konten Seksual', text: 'Mungkin termasuk referensi seksual menengah, dialog sugestif, dan ketelanjangan parsial (non-eksplisit).' },
        { label: 'Bahasa', text: 'Bahasa kasar yang kuat dan seringnya penggunaan kata-kata kotor diizinkan.' },
        { label: 'Tema', text: 'Dapat membahas tema-tema dewasa, horor, dan penggunaan zat adiktif.' }
      ],
      watchFor: ['Kekerasan Realistis', 'Bahasa Kasar', 'Ketelanjangan Parsial', 'Penggunaan Zat']
    },
    6: {
      summary: 'Terbatas untuk dewasa usia 18 tahun ke atas. Konten sangat eksplisit dan tidak cocok untuk anak di bawah umur.',
      sections: [
        { label: 'Kekerasan & Darah', text: 'Mungkin mengandung kekerasan yang intens, sering, dan realistis, termasuk mutilasi, gore ekstrem, dan kekejaman.' },
        { label: 'Konten Seksual', text: 'Mungkin menampilkan konten seksual eksplisit, ketelanjangan penuh, dan tema dewasa yang sangat sugestif.' },
        { label: 'Zat & Perjudian', text: 'Mungkin menggambarkan penggunaan obat terlarang, tema kecanduan, dan simulasi perjudian dengan uang sungguhan.' },
        { label: 'Bahasa', text: 'Penggunaan bahasa kasar dan cacian yang berat tanpa batasan.' }
      ],
      watchFor: ['Kekerasan & Gore Intens', 'Konten Seksual Eksplisit', 'Perjudian Nyata', 'Obat Terlarang']
    },
    35: {
      summary: 'Klasifikasi Rating tertunda atau saat ini belum dinilai oleh lembaga.',
      sections: [
        { label: 'Peringatan', text: 'Game ini belum dinilai secara resmi oleh lembaga IGRS. Kebijaksanaan pemain sangat disarankan karena mungkin mengandung konten dewasa tanpa batasan.' },
        { label: 'Status', text: 'Game ini sedang menunggu peninjauan atau berada di luar batasan klasifikasi standar.' }
      ],
      watchFor: ['Menunggu Klasifikasi', 'Konten Tanpa Batasan']
    }
  }
};

export function getRatingGuideCopy(id: number, lang: Language = 'en'): GuideCopy {
  const localized = RATING_GUIDE_COPY[lang]?.[id] || RATING_GUIDE_COPY.en[id];
  if (!localized) return { summary: '', sections: [], watchFor: [] };
  return localized;
}
