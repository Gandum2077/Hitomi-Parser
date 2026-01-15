export type HMType = "doujinshi" | "manga" | "artistcg" | "gamecg" | "anime";

export type HMNamespace = "artist" | "character" | "female" | "group" | "language" | "male" | "series" | "tag" | "type";

export type HMGalleryBlockInfo = {
  gid: number;
  title: string;
  type: HMType;
  language?: string;
  artists: string[];
  series: string[];
  females: string[];
  males: string[];
  others: string[];
  thumbnail_hashs: string[];
  posted_time: Date;
};

export type HMGalleryBlockInfoWithThumbnailSrc = {
  thumbnail_src: string;
} & HMGalleryBlockInfo;

export type HMGalleryRawJson = {
  language_url: string | null;
  language: string | null;
  artists:
    | {
        url: string;
        artist: string;
      }[]
    | null;
  groups:
    | {
        group: string;
        url: string;
      }[]
    | null;
  type: HMType;
  date: string;
  scene_indexes: number[];
  title: string;
  tags: {
    tag: string;
    url: string;
    female?: string;
    male?: string;
  }[];
  blocked: number;
  related: number[];
  files: {
    hash: string;
    name: string;
    hasAvif: boolean;
    hasWebp?: boolean;
    hasJxl?: boolean;
    width: number;
    height: number;
  }[];
  characters?:
    | {
        url: string;
        character: string;
      }[]
    | null;
  galleryurl: string;
  id: string;
  datepublished: string | null;
  parodys: {
    parody: string;
    url: string;
  }[];
  video: null;
  japanese_title: null;
  language_localname: string;
  languages: {
    name: string; // 语言名称，如english
    galleryid: number;
    language_localname: string;
    url: string;
  }[];
  videofilename: null;
};

export type HMGalleryDetail = {
  gid: number;
  title: string;
  url: string;
  type: HMType;
  length: number;
  language?: string;
  artists: string[];
  groups: string[];
  series: string[];
  characters: string[];
  females: string[];
  males: string[];
  others: string[];
  thumbnail_hash: string;
  files: HMImage[];
  posted_time: Date;
  translations: {
    gid: number;
    language: string;
  }[];
  related_gids: number[];
};

export type HMGalleryDetailWithThumbnailSrcs = {
  thumbnail_src: string;
  file_thumbnail_srcs: string[];
} & HMGalleryDetail;

export type HMImage = {
  hash: string;
  name: string;
  hasAvif: boolean;
  hasWebp?: boolean;
  hasJxl?: boolean;
  width: number;
  height: number;
};

export type HMState =
  | {
      area: "all" | "artist" | "character" | "group" | "series" | "tag" | "type";
      tag: string; // 默认"index"
      language: string; // 默认"all"
      orderby: "date";
      orderbykey: "added" | "published";
      orderbydirection: "desc" | "asc" | "random";
    }
  | {
      area: "all" | "artist" | "character" | "group" | "series" | "tag" | "type";
      tag: string; // 默认"index"
      language: string; // 默认"all"
      orderby: "popular";
      orderbykey: "today" | "week" | "month" | "year";
      orderbydirection: "desc" | "asc" | "random";
    };

export type HMSearchOptions =
  | {
      term: string;
      orderby: "date";
      orderbykey: "added" | "published";
      orderbydirection: "desc" | "asc" | "random";
    }
  | {
      term: string;
      orderby: "popular";
      orderbykey: "today" | "week" | "month" | "year";
      orderbydirection: "desc" | "asc" | "random";
    };
