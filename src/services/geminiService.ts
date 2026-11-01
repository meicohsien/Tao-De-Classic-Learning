import { getLaoziChapter, formatChapterMarkdown } from "../data/laoziChapters";

export async function getMentorFeedback(situation: string) {
  try {
    const res = await fetch("/api/mentor-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situation }),
    });

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error("Gemini service error:", error);
    return {
      feedback: `### 🌊 水之映照
水善利萬物而不爭，處眾人之所惡，故幾於道。面對生命的起伏波瀾，心若能如水般柔軟包容，任何阻礙便不再是窒礙，而是引導我們匯入大海的蜿蜒河道。你此刻所感受到的困頓與心緒，正如同奔流遇石激起的浪花，它並非停滯，而是生命正在蓄積更為寬廣的力量。給自己一點時間，水靜下來，泥沙自沉，明澈的自性便會自然顯露。

### 💡 輕輕轉念
一切境遇的發生，皆是為了成就內在更圓滿的覺知。當我們執著於「事情必須如我所願」時，心靈便生起焦灼；試著輕輕呼出一口氣，將「為什麼會這樣」轉為「這段歷程正想教會我什麼」。退一步思量，退步原來是向前；放下與境遇的較勁，不是軟弱，而是以更大的格局擁抱生命的多樣姿態。

### 🌿 生活實踐
- **靜觀三息**：在思緒紛擾或胸口緊繃時，雙手輕撫心口，進行三次悠長深遠的腹式呼吸，覺察每一次氣息的進出，感受心神回到當下。
- **隨順當下**：今日若遇不如意，對自己溫柔默念：「一切都是最好的安排」，讓心境如流水繞石而過，不與人爭、不與己爭。
- **感恩微光**：睡前在心中點數今天發生的三件微小溫暖之事，並由衷向一直努力生活的自己真誠道一聲辛苦與感謝。

### ✨ 崇德金言
> 「心寬、路就寬；人圓、事就圓。以清淨自性應萬事，以慈悲大愛渡有緣。」
聖賢慈語如甘霖潤物，提醒我們真正的力量不是強行對抗，而是以自性的純淨與寬厚，融化人生的稜角與冰霜。心靈寬廣了，眼前的天地自然無比遼闊。

### 🕊️ 導師暖心叮嚀
親愛的朋友，請記得常常擁抱那個努力前行的自己。你內在的佛性本自具足、純淨無染，任何人間風雨都動搖不了你靈魂深處的澄澈。願你的心常駐安詳，步步皆是蓮花盛開。`,
      interpretation: "水之所以能成其大，在於其甘居卑下而能容；崇德金言所啟示的『心寬境寬』，正是上善若水在日用倫常中的真實流露。當我們放寬眼界，以慈悲寬宥萬物，內心的糾結自然雲消霧散，自性智慧如明月普照澄湖。",
      annotations: {
        "若水": "如同流水一般具備柔和、利他、包容且能順應各種器皿與環境的高尚德性。",
        "自性": "眾生本來具備的純淨佛性與良知良能，不假外求，無染無礙。",
        "心寬": "放下對境相的執著抗拒，以虛懷若谷的胸襟承載生命的一切考驗。"
      },
      moodScore: 82,
      moodLabel: "澄懷觀道"
    };
  }
}

export async function getLaoziChapterDetail(chapterNumber: number) {
  const localChapter = getLaoziChapter(chapterNumber);
  const fallbackDetail = formatChapterMarkdown(localChapter);
  const fallbackResult = {
    detail: fallbackDetail,
    wordAnalysis: localChapter.wordAnalysis,
    title: localChapter.title,
    sign: localChapter.sign,
    quote: localChapter.quote,
  };

  try {
    const res = await fetch("/api/laozi-chapter-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterNumber }),
    });

    if (!res.ok) {
      return fallbackResult;
    }

    const data = await res.json();
    if (!data.detail || data.detail.includes("正在翻閱典籍中") || data.detail.length < 50) {
      return fallbackResult;
    }

    return {
      detail: data.detail,
      wordAnalysis: (data.wordAnalysis && data.wordAnalysis.length > 0) ? data.wordAnalysis : localChapter.wordAnalysis,
      title: data.title || localChapter.title,
      sign: data.sign || localChapter.sign,
      quote: data.quote || localChapter.quote,
    };
  } catch (error) {
    console.warn("Using local chapter due to fetch error:", error);
    return fallbackResult;
  }
}
