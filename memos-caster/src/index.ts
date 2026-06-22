// memos の webhook を受け、新規 PUBLIC メモを Slack / Discord へファンアウトする Cloudflare Worker。
// 公開エンドポイントは URL パスの SECRET TOKEN で保護し、固定の Slack/Discord URL にのみ POST する。
// 参考: memos webhook payload = { url, activityType, creator, memo(v1pb.Memo) }、
//       レスポンスは {"code":0} で成功扱い。

export interface Env {
	// secrets (wrangler secret put で設定):
	CAST_TOKEN: string; // URL パスに使う SECRET TOKEN。/<token> への POST だけ通す
	SLACK_WEBHOOK_URLS?: string; // カンマ区切り
	DISCORD_WEBHOOK_URLS?: string; // カンマ区切り
	// vars (wrangler.toml):
	MEMOS_PUBLIC_BASE_URL?: string;
	CAST_VISIBILITY?: string;
	CAST_MAX_CHARS?: string;
	CAST_DEBUG_RAW?: string;
}

// memos が POST する payload（必要な項目だけ）。memo は v1pb.Memo の protojson。
// Memo に uid は無く、識別子は name（"memos/{id}"）。visibility は enum 数値(3=PUBLIC) で来る。
interface MemosWebhook {
	activityType?: unknown;
	memo?: {
		name?: string;
		content?: unknown;
		visibility?: unknown;
	};
}

// memos はレスポンス body を {code,message} として unmarshal し code==0 を成功とみなす。
function jsonOk(): Response {
	return new Response('{"code":0,"message":"ok"}', {
		headers: { "content-type": "application/json" },
	});
}

function splitUrls(s?: string): string[] {
	return (s ?? "")
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
}

// 公開メモのリンク slug は name("memos/{id}") の末尾。
function memoSlug(name?: string): string {
	if (!name) return "";
	const i = name.lastIndexOf("/");
	return i >= 0 ? name.slice(i + 1) : name;
}

// visibility は enum 数値(1=PRIVATE,2=PROTECTED,3=PUBLIC) か文字列("PUBLIC") で来る。
function normVisibility(v: unknown): string {
	if (typeof v === "number") {
		const names: Record<number, string> = { 1: "PRIVATE", 2: "PROTECTED", 3: "PUBLIC" };
		return names[v] ?? String(v);
	}
	return String(v ?? "").toUpperCase();
}

function truncate(s: string, n: number): string {
	const chars = [...s];
	return chars.length <= n ? s : chars.slice(0, n).join("") + "…";
}

// 高エントロピートークン同士の定数時間比較（タイミング差で長さ/内容を漏らさない）。
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

async function postJson(url: string, body: unknown): Promise<void> {
	try {
		const r = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!r.ok) console.log(`[cast] POST non-2xx: ${r.status}`);
	} catch (e) {
		// 失敗ログに URL は出さない（トークン/宛先を漏らさない）
		console.log(`[cast] POST failed: ${e}`);
	}
}

async function handle(p: MemosWebhook, env: Env): Promise<void> {
	const targetV = (env.CAST_VISIBILITY || "PUBLIC").toUpperCase();
	const maxLen = parseInt(env.CAST_MAX_CHARS || "1500", 10);
	const base = (env.MEMOS_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
	const slack = splitUrls(env.SLACK_WEBHOOK_URLS);
	const discord = splitUrls(env.DISCORD_WEBHOOK_URLS);

	const atype = String(p.activityType ?? "").toLowerCase();
	if (!atype.includes("created")) {
		console.log(`[cast] skip (activityType=${atype})`);
		return;
	}
	const memo = p.memo ?? {};
	const vis = normVisibility(memo.visibility);
	if (vis !== targetV) {
		console.log(`[cast] skip (visibility=${JSON.stringify(memo.visibility)} -> ${vis})`);
		return;
	}

	const content = truncate(String(memo.content ?? "").trim(), maxLen);
	const slug = memoSlug(memo.name);
	const link = base && slug ? `${base}/memos/${slug}` : "";

	const tasks: Promise<void>[] = [];
	if (slack.length) {
		const text = content + (link ? `\n<${link}>` : "");
		for (const u of slack) tasks.push(postJson(u, { text }));
	}
	if (discord.length) {
		const body = truncate(content + (link ? `\n${link}` : ""), 2000);
		for (const u of discord) tasks.push(postJson(u, { content: body }));
	}
	await Promise.all(tasks);
	console.log(`[cast] fanned out: slack=${slack.length} discord=${discord.length} link=${link || "-"}`);
}

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (req.method !== "POST") return jsonOk();

		// SECRET TOKEN: /<token> への POST 以外は 404（存在も示唆しない）
		const path = new URL(req.url).pathname.replace(/^\//, "");
		if (!env.CAST_TOKEN || !timingSafeEqual(path, env.CAST_TOKEN)) {
			return new Response("not found", { status: 404 });
		}

		const raw = await req.text().catch(() => "");
		if (env.CAST_DEBUG_RAW === "1") console.log(`[cast] raw: ${raw}`);

		let p: MemosWebhook;
		try {
			p = JSON.parse(raw || "{}");
		} catch (e) {
			console.log(`[cast] bad json: ${e}`);
			return jsonOk();
		}

		// memos には即 JSON 200 を返し、ファンアウトはバックグラウンドで完了させる
		ctx.waitUntil(handle(p, env));
		return jsonOk();
	},
} satisfies ExportedHandler<Env>;
