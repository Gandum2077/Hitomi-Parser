import * as cheerio from "cheerio";

import { HMParseError } from "./error";
import { HMGalleryBlockInfo, HMGalleryDetail, HMGalleryRawJson } from "./types";

function toISO8601(s: string) {
  // 1. 空格换成 T
  // 2. 如果末尾只有 ±HH，就补上 ":00"
  return s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
}

function _formatDate(date: Date) {
  // 辅助：不足两位则前面补 '0'
  function pad(n: number) {
    return n < 10 ? "0" + n : n;
  }
  const year = date.getFullYear(); // 本地年
  const month = pad(date.getMonth() + 1); // 月份从 0 开始，+1
  const day = pad(date.getDate()); // 日
  const hour = pad(date.getHours()); // 时
  const minute = pad(date.getMinutes()); // 分

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 解析单个「画廊卡片」块得到业务对象
 * @param {string} body 整块 HTML
 * @returns {HMGalleryBlockInfo}
 */
export function parseGalleryBlockInfo(body: string): HMGalleryBlockInfo {
  const $ = cheerio.load(body, { decodeEntities: false });

  /* ---------- 标题 & 详情页链接 ---------- */
  const titleLink = $("h1.lillie > a").first();
  const href = titleLink.attr("href") || "";
  const idMatch = /-(\d+)\.html$/.exec(href);
  if (!idMatch) throw new HMParseError("invalid title href");
  const gid = parseInt(idMatch[1]);
  const title = titleLink.text().trim();

  /* ---------- 封面 ---------- */
  let thumbnail_hashs: string[] = [];
  $("img").map((_, img) => {
    const src = $(img).attr("data-src") || "";
    const hashMatch = /\/(\w{64})\./.exec(src);
    if (hashMatch) thumbnail_hashs.push(hashMatch[1]);
  });

  /* ---------- 作者 ---------- */
  const artists: string[] = $(".artist-list li a")
    .map((_, a) => $(a).text().trim())
    .get();

  /* ---------- Series / Type / Language ---------- */
  const series: string[] = [];
  let type: "doujinshi" | "manga" | "artistcg" | "gamecg" | "anime" | undefined = undefined;
  let language: string | undefined = undefined;

  $(".dj-desc tr").each((_, tr) => {
    const $cells = $(tr).children();
    const key = $cells.eq(0).text().trim().toLowerCase();
    const $value = $cells.eq(1);

    switch (key) {
      case "series": {
        const txt = $value.text().trim();
        if (txt !== "N/A") {
          $value.find("a").each((_, a) => series.push($(a).text().trim()));
        }
        break;
      }
      case "type":
        type = $value.text().trim().replace(" ", "") as "doujinshi" | "manga" | "artistcg" | "gamecg" | "anime";
        break;
      case "language": {
        const txt = $value.text().trim();
        if (txt !== "N/A") {
          const langHref = $value.find("a").attr("href") || "";
          const m = /\/index-(\w+)\.html/.exec(langHref);
          if (m) language = m[1];
        }
        break;
      }
    }
  });
  if (!type) throw new HMParseError("invalid type");

  /* ---------- 标签 ---------- */
  const females: string[] = [];
  const males: string[] = [];
  const others: string[] = [];
  $(".relatedtags li a").each((_, a) => {
    const text = $(a).text().trim();
    if (text.endsWith(" ♀")) {
      females.push(text.slice(0, -2));
    } else if (text.endsWith(" ♂")) {
      males.push(text.slice(0, -2));
    } else {
      others.push(text);
    }
  });

  /* ---------- 发表日期 ---------- */
  const postedRaw = $(".date").first().text().trim();
  const posted_time = new Date(toISO8601(postedRaw));

  return {
    gid,
    title,
    type,
    language,
    artists,
    series,
    females,
    males,
    others,
    thumbnail_hashs,
    posted_time,
  };
}

/**
 *
 * @param {string} text
 * @returns {HMGalleryDetail}
 */
export function parseGalleryDetail(text: string): HMGalleryDetail {
  const data: HMGalleryRawJson = JSON.parse(text.slice(18));
  const artists: string[] = [];
  const groups: string[] = [];
  const series: string[] = [];
  const characters: string[] = [];
  const females: string[] = [];
  const males: string[] = [];
  const others: string[] = [];
  const translations: {
    gid: number;
    language: string;
  }[] = [];
  const related_gids: number[] = [];
  if ("artists" in data && Array.isArray(data.artists) && data.artists.length > 0) {
    data.artists.forEach((n) => artists.push(n.artist));
  }
  if ("groups" in data && Array.isArray(data.groups) && data.groups.length > 0) {
    data.groups.forEach((n) => groups.push(n.group));
  }
  if ("parodys" in data && Array.isArray(data.parodys) && data.parodys.length > 0) {
    data.parodys.forEach((n) => series.push(n.parody));
  }
  if ("characters" in data && Array.isArray(data.characters) && data.characters.length > 0) {
    data.characters.forEach((n) => characters.push(n.character));
  }
  if ("tags" in data && Array.isArray(data.tags) && data.tags.length > 0) {
    data.tags.filter((n) => n.female === "1").forEach((n) => females.push(n.tag));
    data.tags.filter((n) => n.male === "1").forEach((n) => males.push(n.tag));
    data.tags.filter((n) => !n.male && !n.female).forEach((n) => others.push(n.tag));
  }
  if ("languages" in data && Array.isArray(data.languages) && data.languages.length > 0) {
    data.languages.forEach((n) => {
      translations.push({
        gid: n.galleryid,
        language: n.name,
      });
    });
  }
  if ("related" in data && Array.isArray(data.related) && data.related.length > 0) {
    data.related.forEach((n) => related_gids.push(n));
  }

  return {
    gid: parseInt(data.id),
    title: data.title,
    url: "https://hitomi.la" + data.galleryurl,
    type: data.type,
    length: data.files.length,
    language: "language" in data && data.language ? data.language : undefined,
    artists,
    groups,
    series,
    characters,
    females,
    males,
    others,
    thumbnail_hash: data.files[0].hash,
    files: data.files,
    posted_time: new Date(toISO8601(data.date)),
    translations,
    related_gids,
  };
}
