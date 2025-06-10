package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
	"chatbot-backend/commondata"
)

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
		Message    string `json:"message"`
		Faculty    string `json:"faculty"`
		Department string `json:"department"`
	}

	if err := c.ShouldBindJSON(&requestBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "リクエスト形式が正しくありません"})
		return
	}

	if requestBody.Message == "" || requestBody.Faculty == "" || requestBody.Department == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "メッセージ、学部、学科の指定が必要です"})
		return
	}

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
	handbookContent, err := loadHandbook(requestBody.Faculty)
	if err != nil {
		log.Printf("便覧読み込みエラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "学生便覧の読み込みに失敗しました。"})
		return
	}

	ctx := context.Background()
	// Geminiクライアントの初期化
	client, err := genai.NewClient(ctx, option.WithAPIKey(os.Getenv("GOOGLE_GENERATIVE_AI_API_KEY")))
	if err != nil {
		log.Printf("Geminiクライアント作成エラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AIサービスの接続に失敗しました"})
		return
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-1.5-flash")

	// プロンプトの組み立て
	prompt := fmt.Sprintf(`
あなたは神戸大学%sの学生便覧に詳しいチャットボットです。
ユーザーは特に「%s」に関する情報を探しています。
以下の%s学生便覧の内容に基づいて、ユーザーの質問に回答してください。

# %s学生便覧の内容
%s
# %s学生便覧の内容ここまで

# ユーザーの質問
%s

# 回答のルール
- あなたの知識ではなく、上記の学生便覧の内容のみを情報源としてください。
- 回答は「%s」の学生に関連する内容を優先してください。
- 回答する際は、該当する情報が記載されているページ番号を必ず含めてください（例：「○ページに記載されています」）。
- 学生便覧に記載されていない内容については、「学生便覧に記載されていません」と明確に回答してください。
- 回答は日本語で、分かりやすく説明してください。
`, facultyInfo.Name, departmentInfo.Name, facultyInfo.Name, facultyInfo.Name, handbookContent, facultyInfo.Name, requestBody.Message, departmentInfo.Name)

	resp, err := model.GenerateContent(ctx, genai.Text(prompt))
	if err != nil {
		// ここでエラー内容を判定して、レートリミットなどの詳細なエラーを返すことも可能
		log.Printf("Geminiコンテンツ生成エラー: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AIからの応答取得に失敗しました"})
		return
	}

	// レスポンスからテキスト部分を抽出
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
	config.AllowOrigins = []string{"http://localhost:3000"}
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
