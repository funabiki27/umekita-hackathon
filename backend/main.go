package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
	"chatbot-backend/commondata"
)

// ★ フロントエンドから送られてくる会話履歴の型を定義
type ChatMessage struct {
	IsUser  bool   `json:"isUser"`
	Content string `json:"content"`
}
// 学生便覧を読み込む関数
func loadHandbook(facultyKey string) (string, error) {
	// ★★★ commondata パッケージの FacultyData を使うように変更 ★★★
	facultyInfo, ok := commondata.FacultyData[facultyKey]
	if !ok {
		return "", fmt.Errorf("%sに対応する設定が見つかりません", facultyKey)
	}

	// テキストファイルのパスを定義
	textFilePath := fmt.Sprintf("../binran_all_text/handbook_%s.txt", facultyKey)

	// テキストファイルが存在するかチェック
	if _, err := os.Stat(textFilePath); os.IsNotExist(err) {
		return "", fmt.Errorf("%s学生便覧のテキストファイルが見つかりません: %s", facultyInfo.Name, textFilePath)
	}

	// テキストファイルを読み込み
	log.Printf("テキストファイル (%s) を読み込んでいます...\n", textFilePath)
	fileContent, err := os.ReadFile(textFilePath)
	if err != nil {
		return "", fmt.Errorf("テキストファイルの読み込みエラー: %w", err)
	}

	handbookContent := string(fileContent)
	log.Printf("%s学生便覧テキストを読み込みました (%d 文字)\n", facultyInfo.Name, len(handbookContent))

	return handbookContent, nil
}

// チャットAPIのハンドラ
func chatHandler(c *gin.Context) {
	// リクエストボディを定義
	var requestBody struct {
		Message    string        `json:"message"`
		Faculty    string        `json:"faculty"`
		Department string        `json:"department"`
		History    []ChatMessage `json:"history"`
	}

	if err := c.ShouldBindJSON(&requestBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "リクエスト形式が正しくありません"})
		return
	}

	if requestBody.Message == "" || requestBody.Faculty == "" || requestBody.Department == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "メッセージ、学部、学科の指定が必要です"})
		return
	}

	// ▼▼▼ 【修正点1】 facultyInfo と departmentInfo の定義を追加 ▼▼▼
	facultyInfo, ok := commondata.FacultyData[requestBody.Faculty]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "指定された学部は存在しません"})
		return
	}
	departmentInfo, ok := facultyInfo.Departments[requestBody.Department]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "指定された学科は存在しません"})
		return
	}
	// ▲▲▲ ここまで追加 ▲▲▲

	// 学生便覧を読み込む
	handbookContent, err := loadHandbook(requestBody.Faculty)
	if err != nil {
		log.Printf("便覧読み込みエラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "学生便覧の読み込みに失敗しました。"})
		return
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(os.Getenv("GOOGLE_GENERATIVE_AI_API_KEY")))
	if err != nil {
		log.Printf("Geminiクライアント作成エラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AIサービスの接続に失敗しました"})
		return
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-1.5-flash")

	// 会話履歴を文字列に変換する
	var historyBuilder strings.Builder
	for _, msg := range requestBody.History {
		role := "AI"
		if msg.IsUser {
			role = "ユーザー"
		}
		historyBuilder.WriteString(fmt.Sprintf("%s: %s\n", role, msg.Content))
	}

	// プロンプトに会話履歴を追加
		prompt := fmt.Sprintf(`
	あなたは神戸大学%sの学生便覧に詳しいチャットボットです。
	ユーザーは特に「%s」に関する情報を探しています。
	以下の%s学生便覧とこれまでの会話の文脈を考慮して、ユーザーの新しい質問に回答してください。

	# %s学生便覧の内容
	%s
	# %s学生便覧の内容ここまで

	# これまでの会話履歴
	%s
	# これまでの会話履歴ここまで

	# ユーザーの新しい質問
	%s

	# 回答のルール
	- あなたの知識ではなく、上記の学生便覧の内容と会話履歴のみを情報源としてください。
	- 回答は「%s」の学生に関連する内容を優先してください。
	- ページ番号はテキストファイルに「PAGE 数字」のように書かれています。回答でページ数を言うときは「○PAGE」ではなく「○ページ」で示してください。
	- 回答する際は、該当する情報が記載されているページ番号を必ず含めてください（例：「○ページに記載されています」）。
	- 学生便覧に記載されていない内容については、「学生便覧に記載されていません」と明確に回答してください。
	- 回答は日本語で、分かりやすく説明してください。
	`,
			// ▼▼▼ ここからが正しい引数リストです ▼▼▼
			facultyInfo.Name,          // 1. 神戸大学%s
			departmentInfo.Name,       // 2. 「%s」に関する情報
			facultyInfo.Name,          // 3. 以下の%s学生便覧
			facultyInfo.Name,          // 4. # %s学生便覧の内容
			handbookContent,           // 5. (便覧の本文)
			facultyInfo.Name,          // 6. # %s学生便覧の内容ここまで
			historyBuilder.String(),   // 7. (会話履歴)
			requestBody.Message,       // 8. (ユーザーの新しい質問)
			departmentInfo.Name,       // 9. 「%s」の学生に
			// ▲▲▲ ここまで ▲▲▲
		)
	// ▼▼▼ 【修正点2】 レスポンス処理を正しく記述 ▼▼▼
	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		log.Printf("Geminiコンテンツ生成エラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AIからの応答取得に失敗しました"})
		return
	}

	var responseText string
	if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil && len(resp.Candidates[0].Content.Parts) > 0 {
		if txt, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
			responseText = string(txt)
		}
	}

	if responseText == "" {
		responseText = "AIから有効な回答を得られませんでした。"
	}
	// ▲▲▲ ここまで修正 ▲▲▲

	c.JSON(http.StatusOK, gin.H{"response": responseText})
}

func main() {
	// .envファイルを読み込む
	if err := godotenv.Load(); err != nil {
		log.Println("警告: .envファイルが見つかりません")
	}

	// Ginルーターの初期化
	router := gin.Default()

	// CORS (Cross-Origin Resource Sharing) の設定
	// Next.jsの開発サーバー (localhost:3000) からのアクセスを許可する
	config := cors.DefaultConfig()
	config.AllowOrigins = []string{
		"http://localhost:3000",
		"https://a4-handbook-ai.vercel.app/",
	}
	config.AllowMethods = []string{"GET", "POST", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type"}
	router.Use(cors.New(config))

	// APIルートの設定
	router.POST("/api/chat", chatHandler)

	// サーバーの起動
	port := "8080"
	log.Printf("サーバーがポート%sで起動します\n", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("サーバーの起動に失敗しました: %v", err)
	}
}
