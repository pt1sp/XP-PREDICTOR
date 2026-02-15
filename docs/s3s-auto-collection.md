# s3s 自動収集とDB取り込み

## 1. 前提
- このプロジェクトは `backend` の SQLite（`DATABASE_URL`、デフォルト: `file:./dev.db`）に保存します。
- 試合の raw JSON は `matches` テーブルに保持します。

## 2. s3s 初期セットアップ
```powershell
git clone https://github.com/frozenpandaman/s3s.git
cd s3s
python -m pip install -r requirements.txt
python s3s.py
```

初回認証が完了すると `config.txt` が作成されます。

## 3. 試合JSONの出力
```powershell
cd s3s
python s3s.py -o
```

`exports/results/*.json` に 1試合 = 1JSON で出力されます。

## 4. DBへの取り込み
`backend` ディレクトリで実行してください。

```powershell
npm run import:s3s
```

### 環境変数
- `S3S_RESULTS_DIR`:
  - デフォルト: `../s3s/exports/results`
  - 別パスを使う場合のみ設定

例:
```powershell
$env:S3S_RESULTS_DIR="C:\path\to\s3s\exports\results"
npm run import:s3s
```

## 5. 15分ごとの定期実行
15分ごとに次の2コマンドを順番に実行します。

```powershell
python s3s.py -o
cd ..\xp-predictor\backend
npm run import:s3s
```

Windows はタスクスケジューラ、Linux は `cron` を使ってください。

## 6. 取り込み仕様
- `matches.external_id` は UNIQUE（重複防止）です。
- 既存の `external_id` がある試合はスキップされます。
- `raw_json` には SplatNet3 の元JSONをそのまま保存します。
