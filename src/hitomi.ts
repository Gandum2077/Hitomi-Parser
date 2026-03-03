import { HMAPIError } from "./error";
import { parseGalleryBlockInfo, parseGalleryDetail } from "./parser";
import { HMGalleryDetail, HMImage, HMState } from "./types";
import { fakeFetch as fetch } from "./request";

type HMNode = {
  keys: Uint8Array[];
  datas: [number, number][];
  subnode_addresses: number[];
};

type GG = {
  m: (g: number) => number;
  s: (h: string) => number;
  b: string;
};

const domain2 = "gold-usergeneratedcontent.net";
const domain = "ltn." + domain2;
let gg: GG = {
  m: (g: number) => 0,
  s: (h: string) => 0,
  b: "",
};
const nozomiextension = ".nozomi";

const separator = "-";
const extension = ".html";
const galleriesdir = "galleries";
const index_dir = "tagindex";
const galleries_index_dir = "galleriesindex";
const languages_index_dir = "languagesindex";
const nozomiurl_index_dir = "nozomiurlindex";
const max_node_size = 464;
const B = 16;
const compressed_nozomi_prefix = "n";
const tag_index_domain = `tagindex.hitomi.la`;

const refererUrl = "https://hitomi.la/";

// galleriesindex的版本号，默认为空字符串，但在B+树搜索时是必须的，因此需要在此之前获取
let galleries_index_version = "";

/**
 * 哈希一个字符串，返回前4个字节
 * @param term
 * @returns 前4个字节的Uint8Array
 */
function hash_term(term: string): Uint8Array {
  const result: number[] = [];
  const hash = $text.SHA256(term);
  for (let i = 0; i < 4; i++) {
    const t = "0x" + hash.slice(i * 2, i * 2 + 2);
    result.push(parseInt(t));
  }
  return new Uint8Array(result);
  // new Uint8Array(sha256.array(term).slice(0, 4));
}

/**
 * 从DataView中获取一个64位无符号整数
 * @param view
 * @param byteOffset
 * @param littleEndian
 * @returns
 */
function getUint64(view: DataView, byteOffset: number, littleEndian: boolean = false): number {
  const left = view.getUint32(byteOffset, littleEndian);
  const right = view.getUint32(byteOffset + 4, littleEndian);
  const combined = littleEndian ? left + 2 ** 32 * right : 2 ** 32 * left + right;

  if (!Number.isSafeInteger(combined)) {
    console.warn(`${combined} exceeds MAX_SAFE_INTEGER – precision may be lost`);
  }
  return combined;
}

/**
 * 获取指定范围内的URL内容
 * @param url
 * @param range 可选的字节范围，格式为 [start, end]
 * @returns 返回Uint8Array
 */
async function get_url_at_range(url: string, range?: [number, number]): Promise<Uint8Array> {
  const headers: Record<string, any> = { referer: refererUrl };
  if (range) headers.range = `bytes=${range[0]}-${range[1]}`;
  const resp = await fetch(url, { headers });
  if (resp.status !== 200 && resp.status !== 206) {
    throw new HMAPIError(resp.status);
  }
  const buffer = await resp.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * 解码一个节点
 * @param {Uint8Array} data
 * @returns {HMNode}
 */
function decode_node(data: Uint8Array): HMNode {
  let node: HMNode = {
    keys: [],
    datas: [],
    subnode_addresses: [],
  };

  let view = new DataView(data.buffer);
  let pos = 0;

  const number_of_keys = view.getInt32(pos, false /* big-endian */);
  pos += 4;

  let keys = [];
  for (let i = 0; i < number_of_keys; i++) {
    const key_size = view.getInt32(pos, false /* big-endian */);
    if (!key_size || key_size > 32) {
      throw new Error("fatal: !key_size || key_size > 32");
    }
    pos += 4;

    keys.push(data.slice(pos, pos + key_size));
    pos += key_size;
  }

  const number_of_datas = view.getInt32(pos, false /* big-endian */);
  pos += 4;

  let datas: [number, number][] = [];
  for (let i = 0; i < number_of_datas; i++) {
    const offset = getUint64(view, pos, false /* big-endian */);
    pos += 8;

    const length = view.getInt32(pos, false /* big-endian */);
    pos += 4;

    datas.push([offset, length]);
  }

  const number_of_subnode_addresses = B + 1;
  let subnode_addresses = [];
  for (let i = 0; i < number_of_subnode_addresses; i++) {
    let subnode_address = getUint64(view, pos, false /* big-endian */);
    pos += 8;

    subnode_addresses.push(subnode_address);
  }

  node.keys = keys;
  node.datas = datas;
  node.subnode_addresses = subnode_addresses;

  return node;
}

/**
 * 获取指定字段和地址的节点
 * @param field 字段名，实际上只有"galleries"可用
 * @param address 节点地址
 * @param serial 可选的序列号
 * @returns 返回HMNode对象
 */
async function get_node_at_address(field: "galleries", address: number): Promise<HMNode> {
  if (!galleries_index_version) throw new Error("galleries_index_version is not set");
  const url = "https://" + domain + "/" + "galleriesindex/galleries." + galleries_index_version + ".index";
  const data = await get_url_at_range(url, [address, address + max_node_size - 1]);
  return decode_node(data);
}

/**
 * 获取指定数据范围内的gallery IDs
 * @param data 数据范围，格式为 [offset, length]
 * @returns 返回gallery IDs数组
 */
async function get_galleryids_from_data(data: [number, number]): Promise<number[]> {
  if (!galleries_index_version) throw new Error("galleries_index_version is not set");
  let url = "https://" + domain + "/" + galleries_index_dir + "/galleries." + galleries_index_version + ".data";
  let [offset, length] = data;
  if (length > 100000000 || length <= 0) {
    throw new Error("length " + length + " is too long");
  }
  const inbuf = await get_url_at_range(url, [offset, offset + length - 1]);
  let galleryids = [];

  let pos = 0;
  let view = new DataView(inbuf.buffer);
  let number_of_galleryids = view.getInt32(pos, false /* big-endian */);
  pos += 4;

  let expected_length = number_of_galleryids * 4 + 4;

  if (number_of_galleryids > 10000000 || number_of_galleryids <= 0) {
    throw new Error("number_of_galleryids " + number_of_galleryids + " is too long");
  } else if (inbuf.byteLength !== expected_length) {
    throw new Error("inbuf.byteLength " + inbuf.byteLength + " !== expected_length " + expected_length);
  }

  for (let i = 0; i < number_of_galleryids; ++i) {
    galleryids.push(view.getInt32(pos, false /* big-endian */));
    pos += 4;
  }

  return galleryids;
}

/**
 * B+树搜索
 * @param field 字段名，实际上只有"galleries"可用
 * @param key 查询的Uint8Array键
 * @param node 当前节点
 * @returns 返回找到的gallery ID数据范围或undefined
 */
async function B_search(field: "galleries", key: Uint8Array, node: HMNode): Promise<[number, number] | undefined> {
  const compare_arraybuffers = function (dv1: Uint8Array, dv2: Uint8Array) {
    const top = Math.min(dv1.length, dv2.length);
    for (let i = 0; i < top; i++) {
      if (dv1[i] < dv2[i]) {
        return -1;
      } else if (dv1[i] > dv2[i]) {
        return 1;
      }
    }
    return 0;
  };
  const locate_key = function (key: Uint8Array, node: HMNode): [boolean, number] {
    let cmp_result = -1;
    let i;
    for (i = 0; i < node.keys.length; i++) {
      cmp_result = compare_arraybuffers(key, node.keys[i]);
      if (cmp_result <= 0) {
        break;
      }
    }
    return [!cmp_result, i];
  };

  const is_leaf = function (node: HMNode) {
    for (let i = 0; i < node.subnode_addresses.length; i++) {
      if (node.subnode_addresses[i]) {
        return false;
      }
    }
    return true;
  };

  if (!node || !node.keys.length) {
    return;
  }

  let [there, where] = locate_key(key, node);
  if (there) {
    return node.datas[where];
  } else if (is_leaf(node)) {
    return;
  }

  if (node.subnode_addresses[where] == 0) {
    console.error("non-root node address 0");
    return;
  }

  //it's in a subnode
  const subnode = await get_node_at_address(field, node.subnode_addresses[where]);
  return await B_search(field, key, subnode);
}

/**
 * 获取指定查询的gallery IDs，不带namespace，会执行B+树搜索
 * @param query 查询字符串
 * @returns 返回gallery IDs数组
 */
export async function get_galleryids_for_query_without_namespace(query: string) {
  query = query.replace(/_/g, " ");

  const key = hash_term(query);
  const field = "galleries";
  const node = await get_node_at_address(field, 0);

  const data = await B_search(field, key, node);
  if (!data) {
    return [];
  } else {
    return await get_galleryids_from_data(data);
  }
}

/**
 * 根据当前状态生成Nozomi地址
 * @param state 当前状态
 * @param with_prefix 是否包含前缀("n")
 * @returns 返回Nozomi地址
 */
function nozomi_address_from_state(state: HMState, with_prefix: boolean) {
  if (state.orderby !== "date" || state.orderbykey === "published") {
    if (state.area === "all")
      //ltn.hitomi.la/popular/year-all.nozomi
      return (
        "https://" +
        domain +
        "/" +
        (with_prefix ? compressed_nozomi_prefix + "/" : "") +
        [state.orderby, [state.orderbykey, state.language].join("-")].join("/") +
        nozomiextension
      );
    //ltn.hitomi.la/tag/popular/week/female:sole%20female-czech.nozomi
    return (
      "https://" +
      domain +
      "/" +
      (with_prefix ? compressed_nozomi_prefix + "/" : "") +
      [state.area, state.orderby, state.orderbykey, [encodeURI(state.tag), state.language].join("-")].join("/") +
      nozomiextension
    );
  }

  if (state.area === "all")
    return (
      "https://" +
      domain +
      "/" +
      (with_prefix ? compressed_nozomi_prefix + "/" : "") +
      [[encodeURI(state.tag), state.language].join("-")].join("/") +
      nozomiextension
    );
  return (
    "https://" +
    domain +
    "/" +
    (with_prefix ? compressed_nozomi_prefix + "/" : "") +
    [state.area, [encodeURI(state.tag), state.language].join("-")].join("/") +
    nozomiextension
  );
}

/**
 * 获取指定HMState的gallery IDs
 * @param state
 * @returns
 */
export async function get_galleryids_from_state(state: HMState) {
  const url = nozomi_address_from_state(state, true);
  const data = await get_url_at_range(url);
  var nozomi = [];
  var view = new DataView(data.buffer);
  var total = view.byteLength / 4;
  for (var i = 0; i < total; i++) {
    nozomi.push(view.getInt32(i * 4, false /* big-endian */));
  }
  return nozomi;
}

export async function get_galleryids_and_count({
  range,
  state,
}: {
  range: string;
  state: HMState;
}): Promise<{ galleryids: number[]; count: number }> {
  const headers: Record<string, any> = { referer: refererUrl, range };
  const url = nozomi_address_from_state(state, false);
  const resp = await fetch(url, { headers });
  if (resp.status !== 200 && resp.status !== 206) {
    throw new HMAPIError(resp.status);
  }
  const arrayBuffer = await resp.arrayBuffer();

  let itemCount = 0;
  const temp = parseInt(resp.headers.get("content-range")?.replace(/^[Bb]ytes \d+-\d+\//, "") || "");
  if (!isNaN(temp) && temp > 0) {
    itemCount = temp / 4;
  }
  const nozomi = [];
  if (arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const total = view.byteLength / 4;
    for (let i = 0; i < total; i++) {
      nozomi.push(view.getInt32(i * 4, false /* big-endian */));
    }
  }

  return { galleryids: nozomi, count: itemCount };
}

async function get_single_galleryblock(gid: number) {
  const url = "https://" + domain + "/" + `galleryblock/${gid}.html`;
  const resp = await fetch(url, { headers: { referer: refererUrl } });
  return parseGalleryBlockInfo(await resp.text());
}

export async function get_galleryblocks(gids: number[]) {
  if (gids.length > 25) throw new Error("Be careful: too many blocks");
  return await Promise.all(gids.map((n) => get_single_galleryblock(n)));
}

/**
 * 获取索引版本号
 * @param name 索引名称，默认为 "galleriesindex"
 * @returns 返回索引版本号
 */
async function get_index_version(name: "galleriesindex" | "languagesindex" | "nozomiurlindex" = "galleriesindex") {
  const url = "https://" + domain + "/" + name + "/version?_=" + new Date().getTime();
  const resp = await fetch(url, { headers: { referer: refererUrl } });
  if (resp.status === 200) {
    return await resp.text();
  } else {
    throw new HMAPIError(resp.status);
  }
}

export async function update_galleries_index_version() {
  galleries_index_version = await get_index_version();
}

export async function get_image_srcs(files: HMImage[]) {
  const url = "https://" + domain + "/" + "gg.js?_=" + new Date().getTime();
  const resp = await fetch(url, { headers: { referer: refererUrl } });
  if (!resp.ok) {
    throw new HMAPIError(resp.status);
  }
  const ggjs = await resp.text();
  eval(ggjs);
  if (!gg.b) throw new Error();

  const subdomain_from_url = (url: string, base?: string, dir?: string) => {
    var retval = "";
    if (!base) {
      if (dir === "webp") {
        retval = "w";
      } else if (dir === "avif") {
        retval = "a";
      }
    }

    var b = 16;

    var r = /\/[0-9a-f]{61}([0-9a-f]{2})([0-9a-f])/;
    var m = r.exec(url);
    if (!m) {
      return retval;
    }

    var g = parseInt(m[2] + m[1], b);
    if (!isNaN(g)) {
      if (base) {
        retval = String.fromCharCode(97 + gg.m(g)) + base;
      } else {
        retval = retval + (1 + gg.m(g));
      }
    }
    return retval;
  };

  const url_from_url = (url: string, base?: string, dir?: string) => {
    return url.replace(
      /\/\/..?\.(?:gold-usergeneratedcontent\.net|hitomi\.la)\//,
      "//" + subdomain_from_url(url, base, dir) + "." + domain2 + "/",
    );
  };

  const url_from_url_from_hash = (galleryid: number, image: HMImage, dir: string, ext?: string, base?: string) => {
    if ("tn" === base) {
      return url_from_url(
        "https://a." + domain2 + "/" + dir + "/" + real_full_path_from_hash(image.hash) + "." + ext,
        base,
      );
    }
    return url_from_url(url_from_hash(galleryid, image, dir, ext), base, dir);
  };

  const url_from_hash = (galleryid: number, image: HMImage, dir: string, ext?: string) => {
    ext = ext || dir || image.name.split(".").pop()!;
    if (dir === "webp" || dir === "avif") {
      dir = "";
    } else {
      dir += "/";
    }

    return "https://a." + domain2 + "/" + dir + full_path_from_hash(image.hash) + "." + ext;
  };

  const full_path_from_hash = (hash: string) => {
    return gg.b + gg.s(hash) + "/" + hash;
  };

  const real_full_path_from_hash = (hash: string) => {
    return hash.replace(/^.*(..)(.)$/, "$2/$1/" + hash);
  };
  return files.map((image) => url_from_url_from_hash(0, image, "avif"));
}

/**
 * 构建缩略图（small / big）URL
 * @param {string} hash 64 位文件哈希
 * @param {boolean} bigTn 是否返回大缩略图
 * @returns {string}
 */
export function get_thumbnail_url_from_hash(hash: string, bigTn: boolean): string {
  return (
    "https://atn." +
    domain2 +
    "/" +
    `${bigTn ? "avifbigtn" : "avifsmalltn"}/${hash.slice(-1)}/${hash.slice(-3, -1)}/${hash}.avif`
  );
}

export async function get_gallery_detail(gid: number): Promise<HMGalleryDetail> {
  const url = "https://" + domain + "/" + `galleries/${gid}.js`;
  const resp = await fetch(url, { headers: { referer: refererUrl } });
  if (resp.status !== 200) {
    throw new HMAPIError(resp.status);
  }
  return parseGalleryDetail(await resp.text());
}
