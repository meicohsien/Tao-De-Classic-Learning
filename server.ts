import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { getLaoziChapter, formatChapterMarkdown } from "./src/data/laoziChapters";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "10mb" }));

// Lazy/safe initialization for GoogleGenAI
function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY environment variable is missing or invalid.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) return text;
  
  let depth = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.substring(start, i + 1);
        }
      }
    }
  }
  return text.substring(start);
}

// API endpoint: Mentor Feedback
app.post("/api/mentor-feedback", async (req, res) => {
  try {
    const { situation } = req.body || {};
    if (!situation) {
      return res.status(400).json({ error: "situation is required" });
    }

    const ai = getGenAIClient();
    const prompt = `
你是一位融會東方生命哲學（老子《道德經》「上善若水」心法）與一貫道崇德聖哲智慧的資深心靈導師與生命同行者。
請針對學員寫下的這段心情札記／生活近況，給予【極具深度、語氣溫暖真摯、篇幅充足且深具啟發性】的心靈回饋。

學員當前的心境與札記內容：
「${situation}」

【回饋核心指引】
1. 語氣溫暖慈悲：如同在寧靜茶席前為同行者奉上一盞熱茶。不說教、不用冰冷機械的 AI 套話，而是以最深的同理與包容，看見對方的脆弱、努力、困惑或喜悅，給予最真摯的理解、撫慰與陪伴。
2. 篇幅充實且深刻：徹底避免簡短敷衍或只有一兩句草草帶過。每個段落皆須有條有理、文思綿密、情理交融，具備觸動靈魂的厚度與智慧（整體回饋字數建議約 600-900 字）。
3. 融貫古今智慧：將日常生活的瑣碎或心緒波動，巧妙昇華為道法自然的修行體悟，引導學員在生活中涵養「水德」與「自性光明」。

請嚴格遵循以下五個 Markdown 結構輸出 feedback 內容（標題請固定保持一致）：

### 🌊 水之映照
[深度心靈觀照（約 150-250 字）。請以「水」的深邃特質（如：澄澈不波、順勢流動、海納百川、善利萬物而不爭、處眾人之所惡、水滴穿石、蓄勢待發、潤物無聲）作為一面心靈明鏡，深刻映照並同理學員當下的心境。向《道德經》「知不知，上；不知知，病」或「大巧若拙、道法自然」的謙卑與圓融靠攏，溫和點破盲點，撫平內心的焦躁與波瀾，讓學員感受到自己被深深接納與看見。]

### 💡 輕輕轉念
[啟發性思維轉化（約 150-250 字）。提供一條清晰且溫柔的心靈轉念路徑，猶如撥開雲霧見青天。引導學員換位思考或退步海闊天空，看見事物的一體兩面與逆境背後蘊藏的靈魂禮物，學會放下執念、接納不完美，重拾內心的從容、寬廣與定靜。]

### 🌿 生活實踐
[具體日常修行指引（約 150-250 字）。提供 2 至 3 項在呼吸與日常生活之間即可輕鬆實踐的微型修持指引（請使用項目清單 - 列出，每項附帶溫柔的實踐步驟與心法，例如：三次腹式深呼吸的沉靜練習、晨起一杯溫水的感恩冥想、睡前向自己寬厚說聲感謝、或是遇到緊繃時鬆開眉心的覺察小儀式）。]

### ✨ 崇德金言
[聖哲仙佛慈語（約 120-180 字）。請提供一段真實、正見、慈悲且契合當前心境的「一貫道發一崇德」仙佛聖訓（如濟公活佛、月慧菩薩、白水聖帝、不休息菩薩之慈訓或性理心法）。
以 Markdown 引用語法呈現：
> 「...（仙佛訓文金句原文）...」
在引用金句下方，附上 2-3 句溫潤的開導叮嚀，闡釋此句訓文如何點亮當前的心境。嚴禁輸出年代、時間、地點等硬性考證資料，只保留純粹觸動心靈的聖言與慈愛。]

### 🕊️ 導師暖心叮嚀
[真摯祝福小結（約 100-150 字）。以導師身分寫給學員的溫暖私語，給予溫柔的擁抱與堅定支持，肯定其寫下札記的勇氣，提醒他道在身邊、自性具足，願他心如止水、步步生蓮。]

請以繁體中文與合法 JSON 格式回覆：
{
  "feedback": "上述完整的 Markdown 內容（必須包含上述五個標題區塊，篇幅充足，不可草率簡短）",
  "interpretation": "[針對『水之映照』與『崇德金言』的延伸深層義理詮釋，用語溫暖親切且富涵禪意哲理，字數約 180-260 字]",
  "annotations": {
    "關鍵詞彙1": "字義拆解與心靈意涵詮釋（約 30-60 字）",
    "關鍵詞彙2": "字義拆解與心靈意涵詮釋（約 30-60 字）",
    "關鍵詞彙3": "字義拆解與心靈意涵詮釋（約 30-60 字）"
  },
  "moodLabel": "反映當前心靈轉化後的美好心境標籤（如：微瀾映月、滌塵初晴、澄懷觀道、心寬境闊）",
  "moodScore": 85
}
`;

    const generatePromise = ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timeout")), 4500)
    );

    const response = await Promise.race([generatePromise, timeoutPromise]);

    const text = extractJson(response.text ? response.text.trim() : "");
    const result = JSON.parse(text);
    return res.json({
      feedback: result.feedback || "",
      interpretation: result.interpretation || "",
      annotations: result.annotations || {},
      moodLabel: result.moodLabel || "寧靜澄明",
      moodScore: typeof result.moodScore === "number" ? result.moodScore : 80
    });
  } catch (error: any) {
    console.error("Gemini mentor-feedback error:", error);
    return res.json({
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
    });
  }
});

// API endpoint: Laozi Chapter Detail
app.post("/api/laozi-chapter-detail", async (req, res) => {
  try {
    const { chapterNumber } = req.body || {};
    if (!chapterNumber) {
      return res.status(400).json({ error: "chapterNumber is required" });
    }

    const ai = getGenAIClient();
    const prompt = `
你是一位精通《道德經》與修行智慧的導師。請針對第 ${chapterNumber} 章提供極簡、優雅且具備深度架構的導讀。

架構要求（請嚴格按照以下架構，不要包含額外的標題）：

### 📖 一、篇章原文
open-quote [經典原文內容，字句工整] close-quote

### 🌿 二、白話解釋
1. [針對重點字句的拆解與現代語法解釋]
2. ...

### 💡 三、生活中的例子
[針對現代生活場景（職場、家庭、學習等）的具體應用例子，使用列表列出]

### 🛰️ 四、修道者的反思與應用
[針對修道者、修行人的特定反思點與具體應用建議。]
1. [核心反思]
   * 應用：[具體做法]
2. ...

### 🌈 結語
[溫溫理且具啟發性的總結語，分兩至三小段。]

誠心祝福，法喜充滿！

要求：
1. 嚴禁廢話。
2. 保持字句優雅，具備「老子」的悠遠感。
3. 如果原文中有「知不知」等字眼，請深入淺出地解釋其修行意涵。
4. 針對「一貫道」修行背景提供相關的正見反思（如：破除法執、清靜經等概念）。
5. **關鍵要求：字句探義 (Mandatory)**：請針對「篇章原文」進行最細膩的逐字逐句拆解。原文中的每個關鍵詞組都「必須」具備深度解析。
   * **數量限制**：不論篇章長短，「必須」找出至少 6-10 個原文中的關鍵字或詞組。如果原文較短，請拆解為單個文字。
   * **絕對一致性**：這是為了確保前端互動體驗統一，此欄位「絕對不可」為空。
   * **精準匹配**：產出的 word 必須完全一致地出現在 open-quote 和 close-quote 之間的原文中。
   * **注音要求**：所有詞組請務必提供 pronunciation（注音符號）。

請以 JSON 格式回覆：
{
  "detail": "上述所有 Markdown 內容",
  "wordAnalysis": [
    { 
      "word": "原文中的詞組", 
      "meaning": "精確註解，約 30 字",
      "pronunciation": "注音符號",
      "extraMeaning": "道德經其他章節對應或延伸，約 40 字"
    }
  ]
}
`;

    const generatePromise = ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timeout")), 3500)
    );

    const response = await Promise.race([generatePromise, timeoutPromise]);

    const text = extractJson(response.text ? response.text.trim() : "");
    const result = JSON.parse(text);
    const localChapter = getLaoziChapter(chapterNumber);
    return res.json({
      detail: result.detail || formatChapterMarkdown(localChapter),
      wordAnalysis: (result.wordAnalysis && result.wordAnalysis.length > 0) ? result.wordAnalysis : localChapter.wordAnalysis,
      title: localChapter.title,
      sign: localChapter.sign,
      quote: localChapter.quote
    });
  } catch (error: any) {
    console.warn("Gemini laozi-chapter-detail unavailable, returning authentic chapter data:", error?.message || error);
    const localChapter = getLaoziChapter(Number(req.body?.chapterNumber) || 1);
    return res.json({
      detail: formatChapterMarkdown(localChapter),
      wordAnalysis: localChapter.wordAnalysis,
      title: localChapter.title,
      sign: localChapter.sign,
      quote: localChapter.quote
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
