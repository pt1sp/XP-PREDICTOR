# 協力者向け手順書（試合情報の自動送信）

この手順書は、Splatoon3 の試合結果を **s3s** で取得し、本番環境（XP Predictor）へ自動送信するためのものです。

## 0. 先に知っておくこと（重要）
- 送信するのは **試合結果JSON（SplatNet3のデータ）** です。
- **NintendoのログインID/パスワードは送信しません。**
- ただし、試合結果を取得するために、あなたの端末（PC/スマホ）側で **SplatNet3のトークン** が必要です。
- 送信先（XP Predictor）へアップロードするために、Webアプリで発行する **送信用トークン（Collector Token）** が必要です。

## 1. 初回セットアップ（1回だけ）

### 1-1. 必要なもの
- Windows PC（この手順書は Windows 想定）
- iPhone（NSOアプリを使用）
- 同じWi-Fi（PCとiPhoneが同じネットワーク）

### 1-2. PCに入れるもの（無料）
1. Python 3（Windows用）
   - 公式からインストール
   - インストーラーで `Add python.exe to PATH` にチェック
2. Git for Windows
3. （トークン取得に使う）mitmproxy

※「インストールが不安」なら、管理者に画面共有で一緒にやってもらうのが早いです。

### 1-3. s3s を準備
PowerShell を開いて実行:
```powershell
cd C:\dev
git clone https://github.com/frozenpandaman/s3s.git
cd s3s
python -m pip install -r requirements.txt
```

### 1-4. XP Predictor にログインして送信用トークンを発行
1. XP Predictor（本番サイト）にアクセス
2. アカウント登録/ログイン
3. 画面の `設定` を開く
4. `協力者アップロード用トークン` を発行
5. 表示されたトークンを控える（これは **1回しか表示されません**）

このトークンは後で `XP_COLLECTOR_TOKEN` として使います。

### 1-5. SplatNet3のトークンを手動取得（mitmproxy）
imink 自動取得が使えない場合があるため、最初はこの方法を推奨します。

#### (A) PCで mitmweb を起動
```powershell
python -m pip install mitmproxy
mitmweb
```

#### (B) iPhoneでプロキシ設定
1. `設定` → `Wi-Fi`
2. 接続中のWi-Fiの右側 `i`
3. `HTTPプロキシ` → `手動`
4. `サーバ` に PCのIPv4（例: `192.168.1.9`）
5. `ポート` に `8080`

#### (C) 証明書インストール（iPhone）
1. iPhoneのSafariで `http://mitm.it` を開く
2. iOS用の証明書をインストール
3. `設定` → `一般` → `情報` → `証明書信頼設定` で mitmproxy を信頼

#### (D) NSOアプリで通信を発生させる
1. NSOアプリを開く
2. Splatoon3（イカリング3）の画面まで進む

#### (E) mitmweb で2つの値を探す（絶対に他人に見せない）
mitmweb の Flow List で、次のどちらかの通信を探します。

1. `bulletToken`（レスポンスに入っている）
   - URL に `/api/bullet_tokens` が含まれる通信
   - `Response` のJSONに `bulletToken`
2. `gtoken`（リクエストcookieの `_gtoken`）
   - 上と同じ通信の `Request` → `Headers` の `cookie` に `_gtoken=...` が入る
   - **`_gtoken=` の右側の値だけ**をコピー（`;` まで）

この2つをメモします:
- `gtoken`
- `bulletToken`

### 1-6. s3s に gtoken / bulletToken を設定してJSON出力
`C:\dev\s3s\config.txt` を開き、次を確認してください:
- `session_token` が入っている場合は、手動入力を優先するために `""` にしてOK

その後、PowerShellで:
```powershell
cd C:\dev\s3s
python s3s.py -o
```

途中で「NintendoのURLを貼れ」と出たら、手動入力にしたい場合は `skip` を入力します。
その後に表示される入力欄で、先ほど取得した `gtoken` / `bulletToken` を貼り付けます。

成功すると、次の場所に JSON が増えます:
- `C:\dev\s3s\exports\results\*.json`

確認:
```powershell
Get-ChildItem C:\dev\s3s\exports\results\*.json | Select-Object -First 5 Name,Length
```

## 2. 2回目以降（普段の運用：操作なしで自動送信）

### 2-1. 送信スクリプト（Python版）を使う
このリポジトリにある `docs/tools/upload_s3s_results.py` を使います。

実行例（手動で1回だけ試す）:
```powershell
# 送信先URL（管理者から共有される）
$env:XP_API_BASE_URL="https://<本番URL>"

# 設定画面で発行したトークン
$env:XP_COLLECTOR_TOKEN="<あなたのCollector Token>"

# s3sのresultsディレクトリ
$env:S3S_RESULTS_DIR="C:\dev\s3s\exports\results"

python C:\dev\xp-predictor\docs\tools\upload_s3s_results.py
```

### 2-2. 15分ごとの自動実行（Windows タスクスケジューラ）
やることは「15分ごとに2コマンドを順番に実行」だけです。

実行したい2コマンド:
1. `python s3s.py -o`
2. `python upload_s3s_results.py`

タスクスケジューラの「操作」に入れるコマンド例（PowerShell）:
```powershell
cd C:\dev\s3s
python s3s.py -o

$env:XP_API_BASE_URL="https://<本番URL>"
$env:XP_COLLECTOR_TOKEN="<あなたのCollector Token>"
$env:S3S_RESULTS_DIR="C:\dev\s3s\exports\results"

python C:\dev\xp-predictor\docs\tools\upload_s3s_results.py
```

※ これで、普段は **何もしなくても** 試合情報が送信されます（PCが起動してネット接続されている前提）。

## 3. トークン期限切れで送信できなくなったとき（復旧手順）

### 3-1. 症状
- `python s3s.py -o` が失敗する
- 「tokenが無効」や「Unauthorized」系のエラー

### 3-2. 直す方法（やることは “1-5” と同じ）
1. `mitmweb` を起動
2. iPhoneのプロキシをON（必要なら証明書も）
3. NSOアプリで Splatoon3 画面を開いて通信を発生
4. 新しい `gtoken` / `bulletToken` を取り直す
5. `python s3s.py -o` を再実行し、手動入力で更新

### 3-3. 取得できたら後はいつも通り
```powershell
python s3s.py -o
python C:\dev\xp-predictor\docs\tools\upload_s3s_results.py
```

## 4. セキュリティ注意
- `gtoken` / `bulletToken` / `Collector Token` は **絶対に他人に送らない**
- 画面共有する場合は、トークンが表示される画面を避ける
- mitmproxy設定が不要になったら:
  - iPhoneの `HTTPプロキシ` を OFF に戻す
  - 証明書も不要なら削除推奨

