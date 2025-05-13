document.addEventListener("DOMContentLoaded", function () {
    // 更新时间和日期
	function updateDateTime() {
		const now = new Date();
		const timeElement = document.getElementById('current-time');
		const dateElement = document.getElementById('current-date');
		// 显示时:分:秒
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		timeElement.textContent = `${hours}:${minutes}:${seconds}`;
		// 日期
		const year = now.getFullYear();
		const month = now.getMonth() + 1;
		const day = now.getDate();
		dateElement.textContent = `${year}年${month}月${day}日`;
	}
	// 立即更新一次
	updateDateTime();
	// 每秒更新一次
	setInterval(updateDateTime, 1000);

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
	    
	    // 淡入效果
	    setTimeout(() => {
	        messageContainer.style.opacity = '1';
	    }, 10);
	
	    // 在一定时间后隐藏消息
	    setTimeout(() => {
	        hideMessage();
	    }, 2000); // 显示2秒
	}
	
	// 函数2：隐藏消息
	function hideMessage() {
	    // 淡出效果
	    messageContainer.style.opacity = '0';
	    
	    // 完全隐藏
	    setTimeout(() => {
	        messageContainer.style.display = 'none';
	    }, 300);
	}
	// 示例用法
	showMessage('欢迎');

	// 控制搜索框在滚动时的行为
	const searchContainer = document.querySelector('.search-container');
	const searchContainerWrapper = document.querySelector('.search-container-wrapper');
	let searchContainerHeight = searchContainerWrapper.offsetHeight;
	let searchContainerOffset = searchContainerWrapper.offsetTop;
	let lastScrollPosition = 0;
	let ticking = false;
	
	// 初始化搜索框位置信息
	function initSearchContainerPosition() {
	    searchContainerHeight = searchContainerWrapper.offsetHeight;
	    searchContainerOffset = searchContainerWrapper.offsetTop;
	    handleScroll();
	}
	
	// 处理滚动事件
	function handleScroll() {
	    const scrollY = window.scrollY || window.pageYOffset;
	    const documentHeight = document.documentElement.scrollHeight;
	    const windowHeight = window.innerHeight;
	    
	    // 检查页面是否有足够的内容可以滚动
	    const hasScrollableContent = documentHeight > windowHeight;
	    
	    // 只有当页面有足够内容可以滚动时，才处理固定定位
	    if (hasScrollableContent) {
	        // 当滚动超过搜索框位置时添加固定样式
	        if (scrollY > searchContainerOffset + 50) {
	            if (!searchContainer.classList.contains('fixed')) {
	                searchContainer.classList.add('fixed');
	            }
	        } else {
	            searchContainer.classList.remove('fixed');
	        }
	    } else {
	        // 如果页面内容不足以滚动，移除固定定位
	        searchContainer.classList.remove('fixed');
	    }
	    
	    ticking = false;
	}
	
	// 优化滚动事件处理，减少重绘
	function requestScrollTick() {
	    if (!ticking) {
	        requestAnimationFrame(handleScroll);
	        ticking = true;
	    }
	}
	
	// 监听滚动事件
	window.addEventListener('scroll', requestScrollTick);
	
	// 监听窗口大小变化，重新计算位置
	window.addEventListener('resize', initSearchContainerPosition);
	
	// 页面加载后初始化位置
	window.addEventListener('load', initSearchContainerPosition);

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
		document.getElementById('edit-tag').value = '';
		document.getElementById('edit-thumbnail').value = '';
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

    // 1. 分类内排序
    for (const category in categories) {
        categories[category].sort((a, b) => b.ID - a.ID);
    }

    // 2. 分类间排序，得到排序后的分类数组
    const sortedCategories = Object.entries(categories)
        .sort((a, b) => {
            const maxA = Math.max(...a[1].map(link => link.ID));
            const maxB = Math.max(...b[1].map(link => link.ID));
            return maxB - maxA;
        });

    // 渲染链接，按排序后的分类顺序
    for (const [category, categoryLinks] of sortedCategories) {
        // 创建分类容器
        const categoryContainer = document.createElement('div');
        categoryContainer.className = 'category-container';

        // 创建分类标题和折叠按钮
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        
        const categoryTitle = document.createElement('h2');
        categoryTitle.textContent = category;
        
        // 数量标签
        const cardCount = document.createElement('span');
        cardCount.className = 'card-count';
        cardCount.textContent = categoryLinks.length;
        
        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-button';
        toggleButton.innerHTML = '<i class="ri-arrow-down-s-line"></i>';
        toggleButton.title = '展开/折叠';
        
        categoryHeader.appendChild(categoryTitle);
        categoryHeader.appendChild(cardCount);
        categoryHeader.appendChild(toggleButton);
        categoryContainer.appendChild(categoryHeader);

        // 创建链接列表容器
        const linkList = document.createElement('ul');
        linkList.className = 'link-list';
        categoryContainer.appendChild(linkList);

        // 渲染链接
        categoryLinks.forEach(link => {
            const linkElement = document.createElement('li');
            
            // 创建卡片链接
            const linkCard = document.createElement('a');
            linkCard.setAttribute('class', 'link-card');
            linkCard.setAttribute('href', link.url);
            linkCard.setAttribute('target', '_blank');
            
            // 添加缩略图背景
            if (link.thumbnail) {
                const thumbnailDiv = document.createElement('div');
                thumbnailDiv.className = 'link-card-thumbnail';
                thumbnailDiv.style.backgroundImage = `url(${link.thumbnail})`;
                linkCard.appendChild(thumbnailDiv);
            } else {
                // 如果没有缩略图，可以动态生成一个
                const thumbnailDiv = document.createElement('div');
                thumbnailDiv.className = 'link-card-thumbnail';
                thumbnailDiv.style.backgroundImage = `url(https://s0.wp.com/mshots/v1/${encodeURIComponent(link.url)}?w=240&h=240)`;
                linkCard.appendChild(thumbnailDiv);
            }
            
            // 创建卡片内容区域
            const cardContent = document.createElement('div');
            cardContent.setAttribute('class', 'link-card-content');
            
            // 创建卡片标题
            const cardTitle = document.createElement('h3');
            cardTitle.setAttribute('class', 'link-card-title');
            cardTitle.textContent = link.name;
            
            // 创建卡片标签
            const cardTag = document.createElement('span');
            cardTag.setAttribute('class', 'link-card-tag');
            cardTag.textContent = link.tag || '';
            
            // 组装卡片
            cardContent.appendChild(cardTitle);
            linkCard.appendChild(cardContent);
            linkCard.appendChild(cardTag);
            linkElement.appendChild(linkCard);
            linkList.appendChild(linkElement);
        });

        // 添加折叠功能
        toggleButton.addEventListener('click', () => {
            const isExpanded = linkList.style.display !== 'none';
            linkList.style.display = isExpanded ? 'none' : 'flex';
            toggleButton.innerHTML = isExpanded ? 
                '<i class="ri-arrow-right-s-line"></i>' : 
                '<i class="ri-arrow-down-s-line"></i>';
            categoryContainer.classList.toggle('collapsed');
        });

        linkContainer.appendChild(categoryContainer);
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
        
        // 如果存在标签输入框，则填充标签字段
        const tagInput = document.getElementById('edit-tag');
        if (tagInput) {
            tagInput.value = link.tag || '';
        }
        
        // 如果存在缩略图输入框，则填充缩略图字段
        const thumbnailInput = document.getElementById('edit-thumbnail');
        if (thumbnailInput) {
            thumbnailInput.value = link.thumbnail || '';
        }
	
	    // 保存按钮点击事件处理程序
	    const saveButton = document.getElementById('save-button');
	    saveButton.addEventListener('click', () => {
	        // 获取表单中的修改后的信息
	        const editedName = document.getElementById('edit-name').value;
	        const editedUrl = document.getElementById('edit-url').value;
	        const editedCategory = document.getElementById('edit-category').value;
	        const editedID = document.getElementById('edit-id').value;
            const editedTag = document.getElementById('edit-tag') ? document.getElementById('edit-tag').value : '';
            const editedThumbnail = document.getElementById('edit-thumbnail') ? document.getElementById('edit-thumbnail').value : '';
	
	        // 更新链接信息
	        link.name = editedName;
	        link.url = editedUrl;
	        link.category = editedCategory;
	        link.ID = editedID;
            link.tag = editedTag;
            link.thumbnail = editedThumbnail || `https://s0.wp.com/mshots/v1/${encodeURIComponent(editedUrl)}?w=240&h=240`;
	
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
    
    if (className === 'edit-button') {
        button.className = className + ' icon-button';
        const icon = document.createElement('i');
        icon.className = 'ri-edit-line';
        button.appendChild(icon);
        button.title = '编辑';
    } else if (className === 'delete-button') {
        button.className = className + ' icon-button';
        const icon = document.createElement('i');
        icon.className = 'ri-delete-bin-line';
        button.appendChild(icon);
        button.title = '删除';
    } else {
        button.textContent = text;
        button.className = className;
    }
    
    return button;
}

