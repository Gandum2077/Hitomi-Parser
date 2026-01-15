# Hitomi-Parser

[hitomi.la](https://hitomi.la) parser, compatible with JSBox and NodeJS.

## 用法

`Hitomi-Parser` 提供了一个主要的接口类 `HMAPIHandler`（位于 `src/api.ts`）。

```ts
import { HMAPIHandler } from "./src/api";
const api = new HMAPIHandler();

// api.search用于搜索，它根据term的内容会返回两种结果，通过type为"all"或者"single"来区分
// single: 需要单个term（但是可以再加上一个语言），正向标签，降序排列。
// 此时网站只会返回当前页的结果，因此返回结果里面包含state，后续页面需要缓存state，用api.getSingleTagSearchPage方法获取。
// 每次返回的gids数量最多为25个。
// all: 其他情况，包含多标签、排除标签、or标签等复杂查询
// 此时网站会返回所有符合条件的id列表，用户需要自行分页处理。
const result = await api.search({
  term: "character:remilia_scarlet",
  orderby: "date",
  orderbykey: "added",
  orderbydirection: "desc",
}); // 这种情况下type为single

// 然后通过api.getGalleryblocks获取简要信息块，以生成完整的列表
// 最多只能获取25个gid的块信息
const blocks = await api.getGalleryblocks(result.gids);

// 获取下一页
const nextPage = await api.getSingleTagSearchPage({
  state: result.state,
  page: 1,
});

// 检查是否为单一命名空间标签
const isSingle = api.isSingleTag("artist:someone");

// 获取画廊详情
const detail = await api.getGalleryDetail(123456);

// 画廊详情中是不包含图片链接的，因为该数据会随时间变化，需单独请求
const imageSrcs = await api.getImageSrcs(detail.files);

// 下载图片（仅用于JSBox环境）
const imageData = await api.downloadImage(imageSrcs[0]);

```

## API

**`HMAPIHandler`**: 主入口类，包含查询解析、搜索和从后端获取画廊/图片相关数据的方法。

- **`isSingleTag(term: string)`**: 判断给定 term 是否为单一带命名空间的正向标签（如 `artist:someone`）。
- **`search(options)`**: 综合搜索接口，参数 `options`主要字段示例：
  - `term`: 搜索字符串
  - `orderby`: `'date' | 'popular'`
  - `orderbykey`: `'added' | 'published' | 'today' | 'week' | 'month' | 'year'`
  - `orderbydirection`: `'asc' | 'desc' | 'random'`

  返回值为两种结构之一：
  - 单标签快速查询: `{ type: 'single', state, count, gids }`
  - 组合/多标签查询: `{ type: 'all', count, gids }`
- **`getGalleryblocks(gids: number[])`**: 批量获取简要画廊信息块（适合在列表界面显示）。
- **`getGalleryDetail(gid: number)`**: 获取画廊详情（元数据与文件数组）。
- **`getImageSrcs(files: HMGalleryFile[])`**: 根据画廊文件数组获取对应的图片链接列表。
- **`downloadImage(url: string)`**: （仅JSBox环境）下载图片并返回二进制数据。

## term规则

- 支持的命名空间： `artist`, `character`, `female`, `group`, `language`, `male`, `series`, `tag`, `type`。
- 不能使用`orderby`, `orderbykey`, `orderbydirection`三个命名空间，而是要在options中指定。
- 同一个标签中使用`_`表示空格，如 `female:chinese_dress`。
- 查询字符串中以 `-` 开头的标签表示排除，`or` 用于将多个标签视为“或”关系。

