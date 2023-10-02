# Local Navigation Page

Local Navigation Page 是一个基于本地/局域网的导航页应用，旨在提供一种安全、简单的方式来管理和访问您的常用链接。

## 特性

- **本地存储**: 所有链接和设置都存储在您的本地计算机上，不需要云服务，提供更高的安全性。
- **自定义链接**: 您可以轻松添加、编辑和删除您的常用链接，以满足个性化需求。
- **快速搜索**: 内置搜索框，可用于快速查找和访问您的链接，还支持多个搜索引擎。

## 使用方法

1. **下载本项目**：将本项目克隆到您的计算机上：

   ```bash
   git clone https://github.com/LceAn/LocalNavigationPage.git
   ```

   目录结构
```
HTML 
├── CSS
│   ├── search_input.css
│   ├── settings_box.css
│   └── styles.css
├── data
│   └── links.json
├── index.html
└── js
    ├── bootstrap.min.js
    ├── darkMode.js
    ├── jquery-3.3.1.slim.min.js
    └── main.js
```
由于使用了大量的异步处理，和一堆js来处理功能，所以以防代码混淆，对各个功能予以文件区分。
   
3. **打开导航页**：在浏览器中打开 index.html 文件，或者将其设置为浏览器的默认起始页。

4. **自定义链接**：点击设置按钮，您可以添加、编辑或删除链接，还可以调整导航页的夜间模式和其他设置。

  > 设置中的增加、编辑功能处于搁置状态，因为目前我还没找到一个好办法存储配置信息，连接数据库和设置一些需要云存储的配置是远离静态页面的初衷的。
  >> ~~本来考虑将变量如URL等信息存储成一个数组，如： savedLinks 数组中的数据转换为 JSON 字符串，并将其存储在浏览器的本地存储中，使用键名 'savedLinks'。~~
  >> ~~可惜这也是偏离了简单的初衷，我无法直接看到config信息~~

   目前的解决办法是修改`data/Links.json`文件，其中存储了网站信息
   ID:排序，URL:网址，name:网站名称，catrgory:分类组
```
{
    "links": [
        { "ID":4, "url": "https://www.lcean.com", "name": "LceAn", "category": "云上"},
        { "ID":3, "url": "https://example2.com", "name": "网页2", "category": "分类1"},
		{ "ID":3, "url": "https://example2.com", "name": "网页1", "category": "分类1"},
        { "ID":2, "url": "https://example3.com", "name": "网页3", "category": "分类2"},
        { "ID":1, "url": "https://example4.com", "name": "网页4", "category": "分类3"}
    ]
}

```


6. **快速搜索**：使用导航页内置的搜索框，快速查找和访问您的链接。支持百度、Google 和必应等多个搜索引擎。

## 示例
日间模式
<img width="1667" alt="image" src="https://github.com/LceAn/LocalNavigationPage/assets/63484787/2b6853dc-da8a-4462-8e07-460f2c53e963">
夜间模式
<img width="1667" alt="image" src="https://github.com/LceAn/LocalNavigationPage/assets/63484787/7b5b748f-a3e2-427e-b12b-e2bbf2f98ce2">

## 许可证
本项目采用 Apache-2.0 许可证 - 有关详细信息，请参阅 LICENSE 文件。

## 如何贡献
如果您想为 Local Navigation Page 贡献代码，欢迎提交拉取请求。如果您遇到问题或有建议，也请提出问题。
