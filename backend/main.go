package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"chatbot-backend/commondata" // ローカルパッケージのインポート

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
)

// --- 構造体の定義 ---

// Server はアプリケーションの依存関係（設定やクライアントなど）を保持します。
type Server struct {
	genaiClient *genai.GenerativeModel
	handbookDir string // 学生便覧テキストが格納されているディレクトリ
}

// ChatMessage はフロントエンドから送られてくる会話履歴の型です。
type ChatMessage struct {
	IsUser  bool   `json:"isUser"`
	Content string `json:"content"`
}

// --- プロンプトの定義 ---

// generatePrompt はAIに渡すプロンプトを生成します。
// handlerから分離することで、ロジックをクリーンに保ちます。
func generatePrompt(facultyName, departmentName, handbookContent, history, userMessage string) string {
	// 長いプロンプトをテンプレートとして定義
	const promptTemplate = `
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
`
	return fmt.Sprintf(promptTemplate,
		facultyName,    // 1. 神戸大学%s
		departmentName, // 2. 「%s」に関する情報
		facultyName,    // 3. 以下の%s学生便覧
		facultyName,    // 4. # %s学生便覧の内容
		handbookContent,  // 5. (便覧の本文)
		facultyName,    // 6. # %s学生便覧の内容ここまで
		history,        // 7. (会話履歴)
		userMessage,    // 8. (ユーザーの新しい質問)
		departmentName, // 9. 「%s」の学生に
	)
}


// --- メソッドの定義 ---

// loadHandbook は学生便覧を読み込む関数です。
// (s *Server) をつけることで、Server構造体のメソッドになります。
func (s *Server) loadHandbook(facultyKey string) (string, error) {
	facultyInfo, ok := commondata.FacultyData[facultyKey]
	if !ok {
		return "", fmt.Errorf("FacultyDataにキー '%s' が見つかりません", facultyKey)
	}

	// s.handbookDir を使うことで、パスの指定を柔軟にします。
	textFilePath := fmt.Sprintf("%s/handbook_%s.txt", s.handbookDir, facultyKey)

	fileContent, err := os.ReadFile(textFilePath)
	if err != nil {
		return "", fmt.Errorf("テキストファイル '%s' の読み込みに失敗しました: %w", textFilePath, err)
	}

	log.Printf("%s学生便覧テキスト (%s) を読み込みました\n", facultyInfo.Name, textFilePath)
	return string(fileContent), nil
}

// chatHandler はチャットAPIのハンドラです。
func (s *Server) chatHandler(c *gin.Context) {
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

	// 学部と学科の存在チェック
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

	// 学生便覧を読み込む
	handbookContent, err := s.loadHandbook(requestBody.Faculty)
	if err != nil {
		log.Printf("便覧読み込みエラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "学生便覧情報の取得に失敗しました。"})
		return
	}

	// 会話履歴を組み立てる
	var historyBuilder strings.Builder
	for _, msg := range requestBody.History {
		role := "AI"
		if msg.IsUser {
			role = "ユーザー"
		}
		historyBuilder.WriteString(fmt.Sprintf("%s: %s\n", role, msg.Content))
	}

	// プロンプトを生成
	prompt := generatePrompt(
		facultyInfo.Name,
		departmentInfo.Name,
		handbookContent,
		historyBuilder.String(),
		requestBody.Message,
	)

	// AIモデルからコンテンツを生成
	ctx := context.Background()
	resp, err := s.genaiClient.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		log.Printf("Geminiコンテンツ生成エラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AIからの応答取得に失敗しました"})
		return
	}

	// レスポンスを整形
	var responseText string
	if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil && len(resp.Candidates[0].Content.Parts) > 0 {
		if txt, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
			responseText = string(txt)
		}
	}
	if responseText == "" {
		responseText = "AIから有効な回答を得られませんでした。"
	}

	c.JSON(http.StatusOK, gin.H{"response": responseText})
}


// --- main関数 ---

func main() {
	// .envファイルを読み込む（ファイルがなくてもエラーにしない）
	if err := godotenv.Load(); err != nil {
		log.Println("情報: .envファイルが見つかりません。環境変数から設定を読み込みます。")
	}

	// APIキーを環境変数から取得（必須項目）
	apiKey := os.Getenv("GOOGLE_GENERATIVE_AI_API_KEY")
	if apiKey == "" {
		log.Fatal("エラー: 環境変数 'GOOGLE_GENERATIVE_AI_API_KEY' が設定されていません。")
	}
	
	// 学生便覧テキストのディレクトリパスを取得
	handbookDir := os.Getenv("HANDBOOK_DIR")
	if handbookDir == "" {
		handbookDir = "../binran_all_text" // デフォルト値を設定
		log.Printf("情報: 'HANDBOOK_DIR'が未設定のため、デフォルト値 '%s' を使用します。", handbookDir)
	}

	// Geminiクライアントを初期化
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		log.Fatalf("Geminiクライアントの作成に失敗しました: %v", err)
	}
	defer client.Close()

	// Server構造体を初期化
	server := &Server{
		genaiClient: client.GenerativeModel("gemini-1.5-flash"),
		handbookDir: handbookDir,
	}

	// Ginルーターの初期化と設定
	router := gin.Default()

	config := cors.DefaultConfig()
	config.AllowOrigins = []string{
		"http://localhost:3000",
		"https://a4-handbook-ai.vercel.app", // 末尾のスラッシュは不要
	}
	// ★ 修正点1: GETメソッドを許可リストに追加
	config.AllowMethods = []string{"GET", "POST", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type"}
	router.Use(cors.New(config))

	// APIルートとハンドラを紐付け
	router.POST("/api/chat", server.chatHandler)

	// ★★★ 修正点2: helloを返すエンドポイントを追加 ★★★
	router.GET("/api/hello", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "Hello from Go backend!",
		})
	})
	// ★★★ ここまで ★★★

	// サーバーを起動
	port := "8080"
	log.Printf("サーバーが http://localhost:%s で起動します\n", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("サーバーの起動に失敗しました: %v", err)
	}
}
