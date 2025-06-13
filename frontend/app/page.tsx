"use client";

import { useState, useEffect, useRef } from "react";

// (変更なし) 学部・学科のデータを定義
const departmentsByFaculty = {
  engineering: {
    mechanical: "機械工学科",
    electrical: "電気電子工学科",
    computer_science: "情報知能工学科",
    applied_chemistry: "応用化学科",
    civil_engineering: "市民工学科",
    architecture: "建築学科",
  },
  letters: {
    philosophy: "哲学・倫理学専修",
    history: "歴史学専修",
    literature: "文学専修",
    cultural_studies: "文化学専修",
  },
  science: {
    mathematics: "数学科",
    physics: "物理学科",
    chemistry: "化学科",
    biology: "生物学科",
    planetology: "惑星学科",
  },
  medicine: {
    nursing: "看護学専攻",
    medical_technology: "検査技術科学専攻",
    physical_therapy: "理学療法学専攻",
    occupational_therapy: "作業療法学専攻",
  },
  business_administration: {
    business_administration: "経営学科",
  },
  global_human_sciences: {
    global_cultures: "グローバル文化学科",
    developed_community: "発達コミュニティ学科",
    environment_and_sustainability: "環境共生学科",
    child_education: "子ども教育学科",
  },
  agriculture: {
    "agro-environmental_science": "食料環境システム学科",
    bioresource_science: "資源生命科学科",
    agrobioscience: "生命機能科学科",
  },
  maritime_sciences: {
    maritime_sciences: "海洋政策科学科",
  },
};

type FacultyKey = keyof typeof departmentsByFaculty;

interface Message {
  content: string;
  isUser: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [selectedFaculty, setSelectedFaculty] = useState<FacultyKey | "">("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("");

  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedFaculty) {
      const departments = departmentsByFaculty[selectedFaculty];
      const firstDepartmentKey = Object.keys(departments)[0];
      setSelectedDepartment(firstDepartmentKey);
    } else {
      setSelectedDepartment("");
    }
  }, [selectedFaculty]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    if (!selectedFaculty || !selectedDepartment) {
      alert("学部と学科を選択してください。");
      return;
    }

    const currentHistory = [...messages];

    const userMessage: Message = { content: trimmedInput, isUser: true };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

    try {
      const response = await fetch(`${API_URL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedInput,
          faculty: selectedFaculty,
          department: selectedDepartment,
          history: currentHistory,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage =
          errorData?.error ||
          `サーバーエラーが発生しました (ステータス: ${response.status})`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const responseMessage =
        data.response || "AIから有効な回答を得られませんでした。";
      setMessages((prev) => [
        ...prev,
        { content: responseMessage, isUser: false },
      ]);
    } catch (error) {
      console.error("Fetch error:", error);
      const displayMessage =
        error instanceof Error
          ? error.message
          : "通信エラーが発生しました。バックエンドサーバーが起動しているか確認してください。";
      setMessages((prev) => [
        ...prev,
        {
          content: displayMessage,
          isUser: false,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // (変更なし) JSX部分は省略
  return (
    <div className="container">
      <div className="header">
        <h1>📚 学生便覧チャットボット</h1>
        <p>学部・学科を選択して、何でも質問してください！</p>
      </div>

      <div className="selector-container">
        <div className="selector-group">
          <label htmlFor="facultySelect">学部:</label>
          <select
            id="facultySelect"
            value={selectedFaculty}
            onChange={(e) => setSelectedFaculty(e.target.value as FacultyKey)}
            disabled={isLoading}
          >
            <option value="" disabled>
              学部を選択
            </option>
            {Object.keys(departmentsByFaculty).map((facultyKey) => (
              <option key={facultyKey} value={facultyKey}>
                {
                  {
                    engineering: "工学部",
                    letters: "文学部",
                    science: "理学部",
                    medicine: "医学部",
                    business_administration: "経営学部",
                    global_human_sciences: "国際人間科学部",
                    agriculture: "農学部",
                    maritime_sciences: "海洋政策科学部",
                  }[facultyKey as FacultyKey]
                }
              </option>
            ))}
          </select>
        </div>
        <div className="selector-group">
          <label htmlFor="departmentSelect">学科:</label>
          <select
            id="departmentSelect"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
            disabled={isLoading || !selectedFaculty}
          >
            <option value="" disabled>
              学科を選択
            </option>
            {selectedFaculty &&
              Object.entries(departmentsByFaculty[selectedFaculty]).map(
                ([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ),
              )}
          </select>
        </div>
        <div className="selector-group">
          <label htmlFor="gradeSelect">学年:</label>
          <select
            id="gradeSelect"
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            disabled={isLoading}
          >
            <option value="" disabled>
              学年を選択
            </option>
            <option value="1">1年</option>
            <option value="2">2年</option>
            <option value="3">3年</option>
            <option value="4">4年</option>
          </select>
        </div>
      </div>

      <div className="chat-container" ref={chatContainerRef} id="chatContainer">
        <div className="message bot-message">
          こんにちは！学部と学科を選択してから、質問をお聞かせください。
        </div>
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${msg.isUser ? "user-message" : "bot-message"}`}
            dangerouslySetInnerHTML={{
              __html: msg.content.replace(/\n/g, "<br />"),
            }}
          />
        ))}
        {isLoading && (
          <div className="message bot-message loading">回答を生成中...</div>
        )}
      </div>

      <div className="input-container">
        <input
          type="text"
          id="messageInput"
          placeholder="質問を入力してください..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
          disabled={isLoading}
        />
        <button
          id="sendButton"
          onClick={handleSendMessage}
          disabled={isLoading || !selectedFaculty || !selectedDepartment}
        >
          送信
        </button>
      </div>
    </div>
  );
}
