# mf-exporter

Money Forward ME の集計値を取得し、既存Prometheus向けに `/metrics` を公開する内部サービスです。

個別の取引明細・メモ・認証情報はメトリクスへ出力しません。月次キャッシュフロー用に、収入明細の内容欄を収入元として月単位で集約し、上位7件と「収入（その他）」をラベルへ出力します。保有資産名と金融機関名もポートフォリオ表示のラベルとして出力します。ホスト側へのポート公開は行わず、Dockerの `home-network` 内からだけ取得できます。

## 設定

```bash
cp .env.example .env
```

認証情報は既存サービスと同じく、リポジトリ直下の `secrets/` に値だけを保存します。

| ファイル                                | 内容                                |
| --------------------------------------- | ----------------------------------- |
| `secrets/.env.moneyforward-username`    | Money Forwardのメールアドレス       |
| `secrets/.env.moneyforward-password`    | Money Forwardのパスワード           |
| `secrets/.env.moneyforward-totp-secret` | Base32 TOTP secretまたはotpauth URI |

これらは `.gitignore` 対象で、Docker secretsとしてコンテナへ渡します。通常の環境変数 `MONEYFORWARD_USERNAME`、`MONEYFORWARD_PASSWORD`、`MONEYFORWARD_TOTP_SECRET` もローカル開発時のみ利用できます。

| 変数                          | 内容                             |
| ----------------------------- | -------------------------------- |
| `MONEYFORWARD_HISTORY_MONTHS` | 月次収支の取得月数。既定は24か月 |
| `SYNC_INTERVAL_SECONDS`       | 同期間隔。既定は24時間           |

## 起動

```bash
docker compose -f compose.yml up -d --build
```

Prometheusは `mf-exporter:8000/metrics` をscrapeします。外部公開用のNginx・Cloudflare Tunnel設定は不要です。

## 開発

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

## 取得する値

- 総資産
- 総負債
- 純資産
- Money Forwardに保存された日次の資産履歴
- 日次の資産カテゴリ別履歴（積み上げ推移用）
- 資産カテゴリ別の現在配分
- 保有資産ごとの評価額・前日比・評価損益
- 直近24か月（設定可能）の収入・支出
- 直近24か月のカテゴリ別支出とキャッシュフロー
- 今月・先月の収支
- 1年前比と直近90日の単純トレンド・1年先外挿値
- 同期成否、所要時間、最終成功時刻

Money Forward上で月送りできる範囲を同期します。取引明細そのものは保存・公開しません。

初回だけ指定月数をゆっくり取得して月次集計、カテゴリ別支出、証券口座向け振替を `/data/monthly-summaries.json` にキャッシュします。資産履歴も、初回だけ一覧にある過去月を1ページずつ取得して `/data/asset-history.json` にキャッシュします。以後は月次収支の直近2か月と資産履歴の当月ページだけを更新し、日付キーで既存履歴へマージします。このため、exporter停止中の日次履歴もMoney Forward側に残っていれば次回同期で補完されます。

予測値は直近90日の資産総額を線形回帰して1年先へ外挿した参考値です。入出金を含むため、運用利回りや将来の相場予測としては扱いません。

月送りと資産履歴の過去月取得には各1.5〜3秒の待機を入れ、画像・動画・フォントは取得しません。同期の多重実行と失敗直後の自動再試行も行いません。
