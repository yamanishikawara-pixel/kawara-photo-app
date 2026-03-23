import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

/** Gen2 で JSON 以外の body が来た場合の保険 */
function parseHtmlFromBody(body: unknown): string | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as { html?: unknown };
      return typeof parsed.html === "string" ? parsed.html : undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof body === "object" && "html" in (body as object)) {
    const html = (body as { html?: unknown }).html;
    return typeof html === "string" ? html : undefined;
  }
  return undefined;
}

function launchArgs(): string[] {
  const base = chromium.args;
  if (typeof puppeteer.defaultArgs === "function") {
    return puppeteer.defaultArgs({
      args: base,
      headless: "shell",
    });
  }
  return [...base];
}

export const generatePdf = onRequest(
  {
    memory: "2GiB",
    timeoutSeconds: 120,
    cpu: 1,
    region: "asia-northeast1",
    cors: [
      "https://kawara-photo-app.web.app",
      "https://kawara-photo-app.firebaseapp.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    let browser: Browser | null = null;

    try {
      const html = parseHtmlFromBody(req.body);

      if (!html) {
        res.status(400).send("HTMLデータがありません");
        return;
      }

      chromium.setGraphicsMode = false;

      browser = await puppeteer.launch({
        args: launchArgs(),
        executablePath: await chromium.executablePath(),
        headless: "shell",
        defaultViewport: {
          width: 794,
          height: 1123,
          deviceScaleFactor: 2,
          isMobile: false,
          hasTouch: false,
          isLandscape: false,
        },
      });

      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: "load",
        timeout: 90_000,
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true,
      });

      await browser.close();
      browser = null;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="report.pdf"');
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(Buffer.from(pdfBuffer));
    } catch (error: unknown) {
      const err = error as { message?: string; name?: string; stack?: string };
      logger.error("PDF生成エラー詳細", {
        message: err?.message ?? String(error),
        name: err?.name ?? "",
        stack: err?.stack ?? "",
      });

      if (browser) {
        try {
          await browser.close();
        } catch {
          /* ignore */
        }
      }

      res
        .status(500)
        .send(`PDFの生成に失敗しました: ${err?.message ?? "unknown error"}`);
    }
  },
);
