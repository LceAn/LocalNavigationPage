// main.js

document.addEventListener("DOMContentLoaded", function () {
    // 获取链接数据并渲染到页面
    fetch('data/links.json')
        .then(response => response.json())
        .then(data => {
            const links = data.links;
            // 渲染链接到index
            renderLinksByCategory(links);
			// 渲染链接到设置界面
			renderLinksInSettings(links);
        })
        .catch(error => console.error('加载链接数据失败：', error));
	
	// 在全局范围内存储消息容器的引用
	const messageContainer = document.getElementById('message-container');
	
	// 函数1：显示消息
	function showMessage(message) {
	    // 设置消息内容
	    messageContainer.textContent = message;
	
	    // 显示消息容器
	    messageContainer.style.display = 'block';
	
	    // 在一定时间后隐藏消息
	    setTimeout(() => {
	        hideMessage();
	    }, 1000); // 2秒后隐藏消息
	}
	
	// 函数2：隐藏消息
	function hideMessage() {
	    // 隐藏消息容器
	    messageContainer.style.display = 'none';
	}
	// 示例用法
	showMessage('欢迎');

	// 打开设置按钮的事件处理程序
	const openSettingsButton = document.getElementById('open-settings');
	openSettingsButton.addEventListener('click', function () {
	    const settingsContainer = document.getElementById('settings-container');
	    settingsContainer.style.display = 'block'; // 显示设置界面
		
		// 调用渲染链接到设置界面的函数
		renderLinksInSettings(links); // 请确保 links 变量包含了链接数据
	});
	// 关闭设置按钮的事件处理程序
	const closeSettingsButton = document.getElementById('close-settings');
	closeSettingsButton.addEventListener('click', function () {
		const settingsContainer = document.getElementById('settings-container');
		settingsContainer.style.display = 'none'; // 隐藏设置界面
		showMessage('设置关闭成功');
	});
	// 添加链接按钮的点击事件处理程序
	const addLinkButton = document.getElementById('add-link-button');
	addLinkButton.addEventListener('click', () => {
		// 显示编辑表单，将表单字段清空
		editForm.style.display = 'block';
		document.getElementById('edit-name').value = '';
		document.getElementById('edit-url').value = '';
		document.getElementById('edit-category').value = '';
		document.getElementById('edit-id').value = '';
	});
	// 编辑链接按钮的点击事件处理程序
    const editLinkButton = document.getElementById('edit-link');
    const editForm = document.getElementById('edit-form');
    editLinkButton.addEventListener('click', () => {
        // 显示编辑表单
        editForm.style.display = 'block';
    });

    // 关闭编辑表单按钮的点击事件处理程序
    const closeEditFormButton = document.getElementById('close-settings');
    closeEditFormButton.addEventListener('click', () => {
        // 隐藏编辑表单
        editForm.style.display = 'none';
    });

    // 保存按钮的点击事件处理程序
    const saveButton = document.getElementById('save-button');
    saveButton.addEventListener('click', () => {
        // 在这里处理保存逻辑，包括获取表单中的数据，更新链接信息，保存到 links.json 等操作
        // ...

        // 隐藏编辑表单
        editForm.style.display = 'none';
		showMessage('保存成功');
    });
	
	
	// 获取搜索框和按钮元素
	const searchInput = document.getElementById('search-input');
	// 获取搜索按钮元素
	const searchButtons = document.querySelectorAll('.search-button');
	
	// 点击事件处理程序
	searchButtons.forEach(button => {
	    button.addEventListener('click', () => {
	        const searchTerm = searchInput.value;
	        const searchEngine = button.getAttribute('data-engine');
	        if (searchTerm && searchEngine) {
	            let searchURL = '';
	
	            // 根据搜索引擎不同生成搜索链接
	            switch (searchEngine) {
	                case '百度':
	                    searchURL = `https://www.baidu.com/s?wd=${encodeURIComponent(searchTerm)}`;
	                    break;
	                case 'Google':
	                    searchURL = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;
	                    break;
	                case '必应':
	                    searchURL = `https://www.bing.com/search?q=${encodeURIComponent(searchTerm)}`;
	                    break;
	                default:
	                    break;
	            }
	
	            // 执行搜索
	            if (searchURL) {
	                window.open(searchURL, '_blank'); // '_blank' 表示在新标签页中打开
	            }
	        }
	    });
	});

	// 这里可以添加其他功能
	
});


// 渲染链接的函数（按照分类）
function renderLinksByCategory(links) {
    const linkContainer = document.getElementById('link-container');
    linkContainer.innerHTML = ''; // 清空容器

    // 根据分类创建链接列表
    const categories = {};

    links.forEach(link => {
        const category = link.category;
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(link);
    });

    // 渲染链接
    for (const category in categories) {
        if (categories.hasOwnProperty(category)) {
            const categoryLinks = categories[category];

            // 创建分类标题
            const categoryTitle = document.createElement('h2');
            categoryTitle.textContent = category;
            linkContainer.appendChild(categoryTitle);

            // 创建链接列表
            const linkList = document.createElement('ul');
            linkContainer.appendChild(linkList);

            // 渲染链接
            categoryLinks.forEach(link => {
                const linkElement = document.createElement('li');
                const linkAnchor = document.createElement('a');
                linkAnchor.setAttribute('class', 'link-button');
                linkAnchor.setAttribute('href', link.url);
				linkElement.setAttribute('target', '_blank');
                linkAnchor.textContent = link.name;
                linkElement.appendChild(linkAnchor);
                linkList.appendChild(linkElement);
            });
        }
    }
}


// 渲染链接到设置界面
function renderLinksInSettings(links) {
    const existingLinksList = document.getElementById('existing-links');
    // 清空现有链接列表
    existingLinksList.innerHTML = '';
	
	// 根据分类创建链接列表
	const categories = {};
	
	links.forEach(link => {
	    const category = link.category;
	    if (!categories[category]) {
	        categories[category] = [];
	    }
		categories[category].push(link);
	});
	// 渲染链接
	for (const category in categories) {
		if (categories.hasOwnProperty(category)) {
			const categoryLinks = categories[category];

			// 创建分类标题
			const categoryTitle = document.createElement('h2');
			categoryTitle.textContent = category;
			existingLinksList.appendChild(categoryTitle);

			// 创建链接列表
			const linkList = document.createElement('ul');
			existingLinksList.appendChild(linkList);

			// 渲染链接
			categoryLinks.forEach(link => {
				const linkItem = createLinkItem(link);
				linkList.appendChild(linkItem);
			});
		}
	}
	const linkItem = createLinkItem(link);
	existingLinksList.appendChild(linkItem);
}

// 创建链接列表项，包括链接文本、编辑按钮和删除按钮
function createLinkItem(link) {
    const linkItem = document.createElement('li');
    // 链接文本
    const linkAnchor = document.createElement('a');
    linkAnchor.setAttribute('href', link.url);
    linkAnchor.textContent = link.name;
    linkItem.appendChild(linkAnchor);
	

    // 编辑按钮
	const editButton = createButton('编辑', 'edit-button');
	// 编辑按钮点击事件处理程序
	editButton.addEventListener('click', () => {
	    // 在弹出框中显示当前链接的信息
	    const editForm = document.getElementById('edit-form');
	    editForm.style.display = 'block'; // 显示编辑表单
	
	    // 填充表单字段
	    document.getElementById('edit-name').value = link.name;
	    document.getElementById('edit-url').value = link.url;
	    document.getElementById('edit-category').value = link.category;
	    document.getElementById('edit-id').value = link.ID;
	
	    // 保存按钮点击事件处理程序
	    const saveButton = document.getElementById('save-button');
	    saveButton.addEventListener('click', () => {
	        // 获取表单中的修改后的信息
	        const editedName = document.getElementById('edit-name').value;
	        const editedUrl = document.getElementById('edit-url').value;
	        const editedCategory = document.getElementById('edit-category').value;
	        const editedID = document.getElementById('edit-id').value;
	
	        // 更新链接信息
	        link.name = editedName;
	        link.url = editedUrl;
	        link.category = editedCategory;
	        link.ID = editedID;
	
	        // 更新显示的链接文本
	        linkAnchor.textContent = editedName;
	
	        // 隐藏编辑表单
	        editForm.style.display = 'none';
	
	        // 在这里将修改后的链接信息保存到 links.json 中，可以使用 fetch 或其他方式发送 POST 请求
	        // 请确保在保存之后更新 links.json 文件
	        // ...
	
	        // 输出修改后的链接信息，供测试
	        console.log('保存后的链接信息：', link);
	    });
	});

	linkItem.appendChild(editButton);

    // 删除按钮
    const deleteButton = createButton('删除', 'delete-button');
    // 添加删除按钮的点击事件处理程序
    deleteButton.addEventListener('click', () => {
        // 在这里处理删除链接的逻辑，可以弹出确认框等交互方式
        // 你可以在这里获取 link 对象的信息并允许用户进行删除
        console.log(`删除链接：${link.name}`);
    });
    linkItem.appendChild(deleteButton);

    return linkItem;
}

// 创建按钮元素
function createButton(text, className) {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = className;
    return button;
}

