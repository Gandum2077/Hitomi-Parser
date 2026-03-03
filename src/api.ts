import { namespaces } from "./constant";
import { HMInvalidQueryError } from "./error";
import {
  get_galleryids_for_query_without_namespace,
  get_galleryids_from_state,
  get_galleryids_and_count,
  update_galleries_index_version,
  get_galleryblocks,
  get_gallery_detail,
  get_image_srcs,
  get_thumbnail_url_from_hash,
} from "./hitomi";
import { downloadWithTimeout } from "./request";
import {
  HMGalleryBlockInfoWithThumbnailSrc,
  HMGalleryDetailWithThumbnailSrcs,
  HMImage,
  HMNamespace,
  HMSearchOptions,
  HMState,
} from "./types";

const refererUrl = "https://hitomi.la/";

/**
 * 求交集
 * @param arrays
 * @returns
 */
function intersectAll(arrays: number[][]) {
  if (!arrays.length) return [];
  if (arrays.length === 1) return arrays[0];

  return arrays.reduce((acc, curr) => {
    const set = new Set(curr);
    return acc.filter((x) => set.has(x));
  });
}

/**
 * 求差集(A - B)
 * @param arrA
 * @param arrB
 * @returns
 */
function subtract(arrA: number[], arrB: number[]) {
  const setB = new Set(arrB);
  return arrA.filter((x) => !setB.has(x));
}

/**
 * 求并集
 * @param arrays 数组列表
 * @returns 返回一个包含所有唯一元素的数组
 */
function unionAll(arrays: number[][]) {
  return Array.from(new Set(arrays.flat()));
}

/**
 * 将一个数组随机排序
 * @param arr
 * @returns
 */
function shuffleArray(arr: number[]) {
  const array = arr.slice(); // 创建副本以避免修改原数组
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // 从 0 到 i 之间随机选择索引
    [array[i], array[j]] = [array[j], array[i]]; // 交换元素
  }
  return array;
}

type ParsedTerms = {
  positive_terms: { namespace?: HMNamespace; value: string }[];
  negative_terms: { namespace?: HMNamespace; value: string }[];
  or_terms: { namespace?: HMNamespace; value: string }[][];
};

export class HMAPIHandler {
  constructor() {}

  /**
   * 解析搜索查询字符串，将其拆分为正向、反向和或搜索标签。
   * @param query 搜索字符串
   * @returns 解析后的标签对象，包括 positive_terms、negative_terms、or_terms
   * @throws {HMInvalidQueryError} 当标签格式不合法时抛出此错误
   */
  private parseQuery(query: string): ParsedTerms {
    const positive_terms: { namespace?: HMNamespace; value: string }[] = [];
    const negative_terms: { namespace?: HMNamespace; value: string }[] = [];
    let or_terms: { namespace?: HMNamespace; value: string }[][] = [[]];
    const terms = query.toLowerCase().trim().split(/\s+/);
    terms.forEach((term, i) => {
      if (term === "or") return;

      let namespace: HMNamespace | undefined = undefined;
      let value: string = "";
      if (term.split("").filter((n) => n === ":").length > 1) {
        throw new HMInvalidQueryError("不合法的标签，请使用namespace:tag的格式");
      }
      if (term.includes(":")) {
        const splits = term.split(":");
        const left = splits[0].replace(/^-/, "") as HMNamespace;
        if (namespaces.includes(left)) {
          namespace = left;
        } else {
          throw new HMInvalidQueryError("不合法的namespace");
        }
        if (!splits[1]) throw new HMInvalidQueryError("不合法，标签为空");
        value = splits[1].replace(/_/g, " ");
      } else {
        value = term.replace(/_/g, " ");
      }

      const or_previous = i > 0 && terms[i - 1] === "or";
      const or_next = i + 1 < terms.length && terms[i + 1] === "or";
      if (or_previous || or_next) {
        if (term.match(/^-/)) throw new HMInvalidQueryError("不合法，或搜索中只能使用正向关键词");
        or_terms[or_terms.length - 1].push({ namespace, value });
        if (!or_next) {
          or_terms.push([]);
        }
        return;
      }

      if (term.match(/^-/)) {
        negative_terms.push({ namespace, value });
      } else {
        positive_terms.push({ namespace, value });
      }
    });

    or_terms
      .filter((n) => n.length === 1)
      .forEach((n) => {
        positive_terms.push(n[0]);
      });
    or_terms = or_terms.filter((n) => n.length > 1);
    if ((or_terms.length > 0 || negative_terms.length > 0) && positive_terms.length === 0) {
      positive_terms.push({ value: "" });
    }
    return {
      positive_terms,
      negative_terms,
      or_terms,
    };
  }

  /**
   * 判断给定的搜索词是否为单一标签（带有命名空间的正向标签）。
   * @param term 搜索词
   * @returns 如果是单一标签返回 true，否则返回 false
   * @throws {HMInvalidQueryError} 当标签格式不合法时抛出此错误
   */
  isSingleTag(term: string) {
    const parsed = this.parseQuery(term);
    if (
      parsed.negative_terms.length === 0 &&
      parsed.or_terms.length === 0 &&
      parsed.positive_terms.length === 1 &&
      parsed.positive_terms[0].namespace
    ) {
      return true;
    }
    return false;
  }

  /**
   * 获取单一标签的搜索结果分页。
   * @param params 包含 state（搜索状态）和 page（页码，从0开始）
   * @returns 包含 galleryids 和总数的 Promise
   */
  async getSingleTagSearchPage({
    state,
    page,
  }: {
    state: HMState;
    page: number;
  }): Promise<{ galleryids: number[]; count: number }> {
    return await get_galleryids_and_count({
      state,
      range: "bytes=" + `${page * 100}-${(page + 1) * 100 - 1}`,
    });
  }

  /**
   * 多标签搜索，支持正向、反向和或标签组合。
   * @param options 搜索选项
   * @returns 满足条件的画廊ID数组
   */
  async multiTagSearch(options: HMSearchOptions) {
    const getPromise = (n: { namespace?: HMNamespace; value: string }) => {
      if (!n.value) {
        const state: HMState =
          options.orderby === "date"
            ? {
                area: "all",
                tag: "index",
                language: "all",
                orderby: options.orderby,
                orderbykey: options.orderbykey,
                orderbydirection: options.orderbydirection,
              }
            : {
                area: "all",
                tag: "index",
                language: "all",
                orderby: options.orderby,
                orderbykey: options.orderbykey,
                orderbydirection: options.orderbydirection,
              };
        return get_galleryids_from_state(state);
      } else if (!n.namespace) {
        return get_galleryids_for_query_without_namespace(n.value);
      } else if (n.namespace === "language") {
        const state: HMState =
          options.orderby === "date"
            ? {
                area: "all",
                tag: "index",
                language: n.value,
                orderby: options.orderby,
                orderbykey: options.orderbykey,
                orderbydirection: options.orderbydirection,
              }
            : {
                area: "all",
                tag: "index",
                language: n.value,
                orderby: options.orderby,
                orderbykey: options.orderbykey,
                orderbydirection: options.orderbydirection,
              };
        return get_galleryids_from_state(state);
      } else {
        const state: HMState =
          options.orderby === "date"
            ? {
                area: n.namespace === "female" || n.namespace === "male" ? "tag" : n.namespace,
                tag:
                  n.namespace === "female" ? "female:" + n.value : n.namespace === "male" ? "male:" + n.value : n.value,
                language: "all",
                orderby: options.orderby,
                orderbykey: options.orderbykey,
                orderbydirection: options.orderbydirection,
              }
            : {
                area: n.namespace === "female" || n.namespace === "male" ? "tag" : n.namespace,
                tag:
                  n.namespace === "female" ? "female:" + n.value : n.namespace === "male" ? "male:" + n.value : n.value,
                language: "all",
                orderby: options.orderby,
                orderbykey: options.orderbykey,
                orderbydirection: options.orderbydirection,
              };
        return get_galleryids_from_state(state);
      }
    };
    const parsed = this.parseQuery(options.term);
    const promises = [
      ...parsed.positive_terms.map((n) => getPromise(n)),
      ...parsed.negative_terms.map((n) => getPromise(n)),
      ...parsed.or_terms.flat().map((n) => getPromise(n)),
    ];
    const result = await Promise.all(promises);
    const lp = parsed.positive_terms.length;
    const ln = parsed.negative_terms.length;
    let r = intersectAll(result.slice(0, lp));
    for (let i = lp; i < lp + ln; i++) {
      r = subtract(r, result[i]);
    }
    let i = lp + ln;
    for (const or_term of parsed.or_terms) {
      const length = or_term.length;
      r = intersectAll([r, unionAll(result.slice(i, i + length))]);
      i += length;
    }

    return r;
  }

  /**
   * 综合搜索接口，根据搜索词和排序方式自动选择单标签或多标签搜索。
   * @param options 搜索选项
   * @returns 搜索结果对象，包含类型、画廊ID数组、总数等
   */
  async search(options: HMSearchOptions): Promise<
    | {
        type: "all";
        count: number;
        gids: number[];
      }
    | {
        type: "single";
        state: HMState;
        count: number;
        gids: number[];
      }
  > {
    const parsed = this.parseQuery(options.term);
    if (!options.term.trim() && options.orderbydirection === "desc") {
      const state: HMState =
        options.orderby === "date"
          ? {
              area: "all",
              tag: "index",
              language: "all",
              orderby: options.orderby,
              orderbykey: options.orderbykey,
              orderbydirection: options.orderbydirection,
            }
          : {
              area: "all",
              tag: "index",
              language: "all",
              orderby: options.orderby,
              orderbykey: options.orderbykey,
              orderbydirection: options.orderbydirection,
            };
      const { galleryids, count } = await this.getSingleTagSearchPage({ state, page: 0 });
      return {
        type: "single",
        gids: galleryids,
        count,
        state,
      };
    } else if (
      parsed.negative_terms.length === 0 &&
      parsed.or_terms.length === 0 &&
      parsed.positive_terms.length === 1 &&
      parsed.positive_terms[0].namespace &&
      options.orderbydirection === "desc"
    ) {
      const state: HMState =
        options.orderby === "date"
          ? {
              area: "all",
              tag: "index",
              language: "all",
              orderby: options.orderby,
              orderbykey: options.orderbykey,
              orderbydirection: options.orderbydirection,
            }
          : {
              area: "all",
              tag: "index",
              language: "all",
              orderby: options.orderby,
              orderbykey: options.orderbykey,
              orderbydirection: options.orderbydirection,
            };
      const n = parsed.positive_terms[0];
      if (!n.namespace) throw new HMInvalidQueryError("no namespace");
      if (n.namespace === "language") {
        state.language = n.value;
      } else {
        state.area = n.namespace === "female" || n.namespace === "male" ? "tag" : n.namespace;
        state.tag =
          n.namespace === "female" ? "female:" + n.value : n.namespace === "male" ? "male:" + n.value : n.value;
      }

      const { galleryids, count } = await this.getSingleTagSearchPage({ state, page: 0 });
      return {
        type: "single",
        gids: galleryids,
        count,
        state,
      };
    } else {
      await update_galleries_index_version();
      const gids = await this.multiTagSearch(options);
      const rgids =
        options.orderbydirection === "random"
          ? shuffleArray(gids)
          : options.orderbydirection === "asc"
            ? gids.toReversed()
            : gids;
      return {
        type: "all",
        gids: rgids,
        count: rgids.length,
      };
    }
  }

  /**
   * 获取指定画廊的详细信息。
   * @param gid 画廊ID
   * @returns 画廊详情对象
   */
  async getGalleryDetail(gid: number): Promise<HMGalleryDetailWithThumbnailSrcs> {
    const detail = await get_gallery_detail(gid);
    const thumbnail_src = get_thumbnail_url_from_hash(detail.thumbnail_hash, true);
    const file_thumbnail_srcs = detail.files.map((file) => get_thumbnail_url_from_hash(file.hash, false));
    return {
      ...detail,
      thumbnail_src,
      file_thumbnail_srcs,
    };
  }

  async getImageSrcs(files: HMImage[]): Promise<string[]> {
    const srcs = await get_image_srcs(files);
    return srcs;
  }

  /**
   * 获取多个画廊的简要信息块。
   * @param gids 画廊ID数组
   * @returns 画廊信息块数组
   */
  async getGalleryblocks(gids: number[]): Promise<HMGalleryBlockInfoWithThumbnailSrc[]> {
    const blocks = await get_galleryblocks(gids);
    return blocks.map((block) => ({
      ...block,
      thumbnail_src: get_thumbnail_url_from_hash(block.thumbnail_hashs[0], true),
    }));
  }

  async downloadImage(url: string): Promise<NSData> {
    const header = { referer: refererUrl };
    const resp = await downloadWithTimeout({ url, header, timeout: 30 });
    return resp.data;
  }
}
