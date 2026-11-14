/* 常驻设置与路线，其他工具在悬停、聚焦或触屏长按时展开。 */
document.addEventListener('DOMContentLoaded', () => {
    const toolbar = document.querySelector('.top-right-buttons');
    const positionButton = document.getElementById('position-button');
    const tooltip = document.createElement('div');
    tooltip.id = 'toolbar-tooltip';
    tooltip.className = 'toolbar-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);
    let tooltipAnchor = null;
    let holdTimer;
    let suppressionTimer;
    let suppressedTarget = null;
    let touchStart;

    function hideTooltip() {
        tooltip.hidden = true;
        if (tooltipAnchor) {
            const descriptions = (tooltipAnchor.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== tooltip.id);
            if (descriptions.length) tooltipAnchor.setAttribute('aria-describedby', descriptions.join(' '));
            else tooltipAnchor.removeAttribute('aria-describedby');
        }
        tooltipAnchor = null;
    }

    function refreshButtons() {
        toolbar.querySelectorAll('.icon-button').forEach(button => {
            const label = button.getAttribute('aria-label') || button.getAttribute('title') || '';
            if (label) button.setAttribute('aria-label', label);
            button.removeAttribute('title');
        });
    }

    function showTooltip(button) {
        if (!button || !toolbar.contains(button)) return;
        refreshButtons();
        const label = button.getAttribute('aria-label');
        if (!label) return;
        hideTooltip();
        tooltipAnchor = button;
        tooltip.textContent = label;
        tooltip.hidden = false;
        const descriptions = (button.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        button.setAttribute('aria-describedby', [...descriptions, tooltip.id].join(' '));
        const anchor = button.getBoundingClientRect();
        const bounds = tooltip.getBoundingClientRect();
        tooltip.style.left = Math.max(8, Math.min(anchor.right - bounds.width, document.documentElement.clientWidth - bounds.width - 8)) + 'px';
        let top = anchor.bottom + 8;
        const extras = document.getElementById('toolbar-extras');
        const extraBounds = extras.getBoundingClientRect();
        if (!extras.hidden && toolbar.dataset.openMenu !== 'network' && !extras.contains(button) && extraBounds.top >= anchor.bottom) {
            top = toolbar.getBoundingClientRect().top + parseFloat(getComputedStyle(extras).top) + extras.offsetHeight + 8;
        }
        if (top + bounds.height > window.innerHeight) top = Math.max(8, anchor.top - bounds.height - 8);
        tooltip.style.top = top + 'px';
    }

    window.refreshToolbarButtons = refreshButtons;
    window.setToolbarMenuOpen = (name, open) => {
        if (open) toolbar.dataset.openMenu = name;
        else if (toolbar.dataset.openMenu === name) delete toolbar.dataset.openMenu;
        hideTooltip();
    };
    window.collapseToolbarTools = () => {
        toolbar.classList.remove('tools-expanded');
        hideTooltip();
    };

    toolbar.addEventListener('pointerover', event => {
        if (event.pointerType !== 'touch') showTooltip(event.target.closest('.icon-button'));
    });
    toolbar.addEventListener('pointerout', event => {
        if (!tooltipAnchor?.contains(event.relatedTarget)) hideTooltip();
    });
    toolbar.addEventListener('focusin', event => {
        const button = event.target.closest('.icon-button');
        if (button?.matches(':focus-visible')) showTooltip(button);
    });
    toolbar.addEventListener('focusout', hideTooltip);
    toolbar.addEventListener('click', hideTooltip);

    // 长按只展开工具，普通点击继续执行原按钮动作。
    toolbar.addEventListener('pointerdown', event => {
        if (!['touch', 'pen'].includes(event.pointerType)) return;
        const target = event.target.closest('#open-settings, #network-environment-button');
        if (!target) return;
        touchStart = { x: event.clientX, y: event.clientY };
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            suppressedTarget = target;
            window.closeLayoutMenu(false);
            window.closeNetworkEnvironmentPopover?.();
            toolbar.classList.add('tools-expanded');
            hideTooltip();
        }, 450);
    });
    toolbar.addEventListener('pointermove', event => {
        if (touchStart && Math.abs(event.clientX - touchStart.x) + Math.abs(event.clientY - touchStart.y) > 12) clearTimeout(holdTimer);
    });
    function finishTouch() {
        clearTimeout(holdTimer);
        touchStart = null;
        clearTimeout(suppressionTimer);
        suppressionTimer = setTimeout(() => { suppressedTarget = null; }, 400);
    }
    toolbar.addEventListener('pointerup', finishTouch);
    toolbar.addEventListener('pointercancel', finishTouch);
    toolbar.addEventListener('contextmenu', event => { if (suppressedTarget?.contains(event.target)) event.preventDefault(); });
    toolbar.addEventListener('click', event => {
        if (!suppressedTarget?.contains(event.target)) return;
        suppressedTarget = null;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    toolbar.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...toolbar.querySelectorAll('.icon-button, #network-environment-button')]
            .filter(button => button.getClientRects().length && !button.disabled && getComputedStyle(button).visibility === 'visible');
        const index = buttons.indexOf(event.target.closest('button'));
        if (index < 0) return;
        event.preventDefault();
        let next = index + (event.key === 'ArrowLeft' ? -1 : 1);
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = buttons.length - 1;
        buttons[(next + buttons.length) % buttons.length].focus();
    });

    const menu = document.createElement('div');
    menu.id = 'position-dropdown';
    menu.className = 'dropdown-menu toolbar-layout-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '页面布局与密度');
    menu.hidden = true;
    const options = [
        { label: '首页位置' },
        { text: '靠上布局', icon: 'ri-arrow-up-line', action: 'top' },
        { text: '标准布局', icon: 'ri-align-center', action: 'default' },
        { text: '靠下布局', icon: 'ri-arrow-down-line', action: 'bottom' },
        { label: '快捷网格密度' },
        { text: '紧凑', icon: 'ri-contract-left-right-line', density: 'compact' },
        { text: '均衡', icon: 'ri-dashboard-line', density: 'balanced' },
        { text: '舒展', icon: 'ri-expand-left-right-line', density: 'spacious' }
    ];
    options.forEach(option => {
        if (option.label) {
            const label = document.createElement('div');
            label.className = 'dropdown-section-title';
            label.textContent = option.label;
            menu.append(label);
            return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dropdown-item';
        button.setAttribute('role', 'menuitemradio');
        if (option.action) button.dataset.action = option.action;
        if (option.density) button.dataset.density = option.density;
        const icon = document.createElement('i');
        icon.className = option.icon;
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, document.createTextNode(option.text));
        menu.append(button);
    });
    document.body.append(menu);

    function updateMenuState() {
        const position = getSetting('contentPosition', 'default');
        const { density } = loadHomeLayoutSettings();
        menu.querySelectorAll('.dropdown-item').forEach(button => {
            const selected = button.dataset.action === position || button.dataset.density === density;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-checked', String(selected));
        });
    }
    function closeMenu(restoreFocus = true) {
        const wasOpen = !menu.hidden;
        menu.hidden = true;
        positionButton.setAttribute('aria-expanded', 'false');
        window.setToolbarMenuOpen('layout', false);
        if (wasOpen && restoreFocus) positionButton.focus({ preventScroll: true });
    }
    function openMenu() {
        window.closeNetworkEnvironmentPopover?.();
        if (typeof closeRoutePopover === 'function') closeRoutePopover(false);
        updateMenuState();
        menu.hidden = false;
        positionButton.setAttribute('aria-expanded', 'true');
        window.setToolbarMenuOpen('layout', true);
        const anchor = positionButton.getBoundingClientRect();
        const bounds = menu.getBoundingClientRect();
        const width = document.documentElement.clientWidth;
        menu.style.left = Math.max(8, Math.min(anchor.right - bounds.width, width - bounds.width - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - bounds.height - 8)) + 'px';
        menu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    }
    window.closeLayoutMenu = closeMenu;
    window.refreshLayoutMenu = updateMenuState;
    positionButton.addEventListener('click', () => { if (menu.hidden) openMenu(); else closeMenu(); });
    positionButton.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(); }
    });
    menu.addEventListener('click', event => {
        const choice = event.target.closest('.dropdown-item');
        if (!choice) return;
        if (choice.dataset.action) {
            if (document.body.classList.contains('minimal-mode')) {
                const minimalToggle = document.getElementById('minimal-mode-toggle');
                minimalToggle.checked = false;
                minimalToggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const position = applyContentPosition(choice.dataset.action);
            setSetting('contentPosition', position);
            if (document.body.classList.contains('navigation-open')) closeNavigation();
        }
        if (choice.dataset.density) {
            const settings = { ...loadHomeLayoutSettings(), density: choice.dataset.density };
            saveHomeLayoutSettings(settings);
            applyHomeCategoryDisplayMode(settings);
            document.getElementById('home-density-select').value = settings.density;
            if (!document.body.classList.contains('navigation-open')) openNavigation();
        }
        updateMenuState();
        closeMenu();
    });
    menu.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const choices = [...menu.querySelectorAll('.dropdown-item')];
        const index = choices.indexOf(document.activeElement);
        let next = index + (event.key === 'ArrowUp' ? -1 : 1);
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = choices.length - 1;
        choices[(next + choices.length) % choices.length].focus();
    });
    document.addEventListener('click', event => {
        if (!menu.contains(event.target) && !positionButton.contains(event.target)) closeMenu(false);
        if (!toolbar.contains(event.target) && !menu.contains(event.target)) window.collapseToolbarTools();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); closeMenu(); }
    });
    window.addEventListener('resize', () => { closeMenu(false); hideTooltip(); });
    window.addEventListener('scroll', event => {
        const insideTools = event.target?.nodeType && (menu.contains(event.target) || toolbar.contains(event.target));
        if (!insideTools) closeMenu(false);
        hideTooltip();
    }, { capture: true, passive: true });
    refreshButtons();
    updateMenuState();
});
