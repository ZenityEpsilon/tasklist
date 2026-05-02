const STORAGE_KEY = 'stream-orders-v7';

const ICONS = [
    { id: 'RU_MECH', label: 'RU Mech', file: 'SPEC_RU_Mechanized.png' },
    { id: 'RU_MORSKAYA', label: 'RU Морская', file: 'SPEC_RU_Morskaya.png' },
    { id: 'RU_MOTOSTRELKI', label: 'RU Мотострелки', file: 'SPEC_RU_Motostrelki.png' },
    { id: 'RU_TANK', label: 'RU Танк', file: 'SPEC_RU_Tank.png' },
    { id: 'RU_VDV', label: 'RU ВДВ', file: 'SPEC_RU_VDV.png' },
    { id: 'US_AIRMOBILE', label: 'US Airmobile', file: 'SPEC_US_Airmobile.png' },
    { id: 'US_ARMORED', label: 'US Armored', file: 'SPEC_US_Armored.png' },
    { id: 'US_CAVALRY', label: 'US Cavalry', file: 'SPEC_US_Cavalry.png' },
    { id: 'US_MARINES', label: 'US Marines', file: 'SPEC_US_Marines.png' },
    { id: 'US_SOF', label: 'US SOF', file: 'SPEC_US_SOF.png' }
];

const ICON_BY_ID = Object.fromEntries(ICONS.map(icon => [icon.id, icon]));

const defaultOrders = [
    { title: 'АирСоком Wise Forest', qty: 1, icons: ['RU_MECH', 'US_SOF'] },
    { title: 'Freimann Береги+Шилки', qty: 1, icons: ['RU_MORSKAYA', 'RU_MOTOSTRELKI'] },
    { title: 'F1reRain VDV', qty: 2, icons: ['RU_VDV', 'US_AIRMOBILE'] },
    { title: 'Балтиец эйфория', qty: 2, icons: ['RU_MORSKAYA', 'US_MARINES'] },
    { title: 'ТАНКВДВЧУГУН', qty: 2, icons: ['RU_TANK', 'RU_VDV'] },
    { title: 'ЯКОРЬВДВ ВЕРТОРАШ', qty: 2, icons: ['RU_VDV', 'US_AIRMOBILE'] },
    { title: 'ПЕХОТНАЯ РФ', qty: 2, icons: ['RU_MOTOSTRELKI', 'RU_MECH'] },
    { title: 'ВДВ+МОРЕ Mirror', qty: 1, icons: ['RU_VDV', 'RU_MORSKAYA'] },
    { title: 'МАРИН+СОКОМ Mirror', qty: 1, icons: ['US_MARINES', 'US_SOF'] }
];

let filter = 'all';
let orders = load();

const form = document.getElementById('form');
const input = document.getElementById('input');
const qtyInput = document.getElementById('qtyInput');
const list = document.getElementById('orders');
const template = document.getElementById('template');
const empty = document.getElementById('empty');
const totalCount = document.getElementById('totalCount');
const activeCount = document.getElementById('activeCount');
const qtyCount = document.getElementById('qtyCount');
const clearDone = document.getElementById('clearDone');
const filters = document.querySelectorAll('.filter');
const loadJson = document.getElementById('loadJson');
const saveJson = document.getElementById('saveJson');

render();

form.addEventListener('submit', event => {
    event.preventDefault();

    const parsed = parseTitle(input.value.trim());

    if (!parsed.title) return;

    orders.unshift(makeOrder(
        parsed.title,
        parsed.qty || qtyInput.value,
        detectIcons(parsed.title)
    ));

    input.value = '';
    qtyInput.value = 1;

    save();
    render();
});

filters.forEach(button => {
    button.addEventListener('click', () => {
        filter = button.dataset.filter;

        filters.forEach(item => {
            item.classList.toggle('active', item === button);
        });

        render();
    });
});

clearDone.addEventListener('click', () => {
    orders = orders.filter(order => !order.done);
    save();
    render();
});

loadJson.addEventListener('click', () => {
    const fileInput = document.createElement('input');

    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);

                if (!Array.isArray(data)) {
                    throw new Error('JSON должен быть массивом');
                }

                orders = data.map(normalizeLoadedOrder);
                save();
                render();
            } catch {
                alert('Не удалось загрузить JSON');
            }
        };

        reader.readAsText(file, 'UTF-8');
    });

    fileInput.click();
});

saveJson.addEventListener('click', async () => {
    try {
        const json = JSON.stringify(orders, null, 2);

        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'tasks.json',
                types: [
                    {
                        description: 'JSON file',
                        accept: {
                            'application/json': ['.json']
                        }
                    }
                ]
            });

            const writable = await handle.createWritable();
            await writable.write(json);
            await writable.close();

            return;
        }

        const blob = new Blob([json], {
            type: 'application/json;charset=utf-8'
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = 'tasks.json';

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    } catch (error) {
        if (error.name !== 'AbortError') {
            alert('Ошибка сохранения файла');
        }
    }
});

function render() {
    list.innerHTML = '';

    const visible = orders.filter(order => {
        if (filter === 'active') return !order.done;
        if (filter === 'done') return order.done;
        return true;
    });

    visible.forEach(order => {
        const node = template.content.firstElementChild.cloneNode(true);

        const check = node.querySelector('.check');
        const icons = node.querySelector('.icons');
        const text = node.querySelector('.text');
        const qty = node.querySelector('.qty');
        const del = node.querySelector('.delete');

        node.classList.toggle('done', order.done);

        text.textContent = order.title;
        qty.value = order.qty;

        renderIconPickers(order, icons);

        check.addEventListener('click', () => {
            order.done = !order.done;
            save();
            render();
        });

        del.addEventListener('click', () => {
            orders = orders.filter(item => item.id !== order.id);
            save();
            render();
        });

        qty.addEventListener('change', () => {
            order.qty = normalizeQty(qty.value);
            qty.value = order.qty;
            save();
            renderStats();
        });

        text.addEventListener('blur', () => {
            const parsed = parseTitle(text.textContent.trim());

            if (!parsed.title) {
                orders = orders.filter(item => item.id !== order.id);
                save();
                render();
                return;
            }

            order.title = parsed.title;

            if (parsed.qty) {
                order.qty = parsed.qty;
                qty.value = parsed.qty;
            }

            save();
            renderStats();
        });

        text.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                text.blur();
            }
        });

        list.appendChild(node);
    });

    renderStats();
    empty.classList.toggle('visible', visible.length === 0);
}

function renderIconPickers(order, container) {
    container.innerHTML = '';

    order.icons = normalizeIcons(order.icons);

    order.icons.forEach((iconId, index) => {
        const picker = document.createElement('div');
        const main = document.createElement('button');
        const mainImg = document.createElement('img');
        const menu = document.createElement('div');

        picker.className = 'icon-picker';
        main.className = 'icon-main';
        main.type = 'button';
        menu.className = 'icon-menu';

        mainImg.src = 'icons/' + getIcon(iconId).file;
        mainImg.alt = '';
        main.appendChild(mainImg);

        main.addEventListener('click', event => {
            event.stopPropagation();

            const wasOpen = picker.classList.contains('open');
            closeAllIconMenus();

            picker.classList.toggle('open', !wasOpen);
        });

        ICONS.forEach(icon => {
            const option = document.createElement('button');
            const optionImg = document.createElement('img');
            const optionLabel = document.createElement('span');

            option.className = 'icon-option';
            option.type = 'button';
            option.classList.toggle('active', icon.id === iconId);

            optionImg.src = 'icons/' + icon.file;
            optionImg.alt = '';

            optionLabel.textContent = icon.label;

            option.appendChild(optionImg);
            option.appendChild(optionLabel);

            option.addEventListener('click', event => {
                event.stopPropagation();

                order.icons[index] = icon.id;

                save();
                render();
            });

            menu.appendChild(option);
        });

        picker.appendChild(main);
        picker.appendChild(menu);
        container.appendChild(picker);
    });
}

document.addEventListener('click', closeAllIconMenus);

function closeAllIconMenus() {
    document.querySelectorAll('.icon-picker.open').forEach(item => {
        item.classList.remove('open');
    });
}

function renderStats() {
    totalCount.textContent = orders.length;
    activeCount.textContent = orders.filter(order => !order.done).length;
    qtyCount.textContent = orders.reduce((sum, order) => {
        return sum + normalizeQty(order.qty);
    }, 0);
}

function makeOrder(title, qty = 1, icons = null) {
    return {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        title,
        qty: normalizeQty(qty),
        icons: normalizeIcons(icons || detectIcons(title)),
        done: false
    };
}

function parseTitle(rawTitle) {
    const match = rawTitle.match(/\s+[xхХ](\d+)\s*$/i);

    if (!match) {
        return {
            title: rawTitle,
            qty: null
        };
    }

    return {
        title: rawTitle.replace(/\s+[xхХ]\d+\s*$/i, '').trim(),
        qty: normalizeQty(match[1])
    };
}

function normalizeQty(value) {
    const number = Number.parseInt(value, 10);

    if (!Number.isFinite(number) || number < 1) return 1;

    return number;
}

function normalizeIcons(icons) {
    const normalized = Array.isArray(icons) ? icons.slice(0, 2) : [];

    while (normalized.length < 2) {
        normalized.push('RU_MECH');
    }

    return normalized.map(icon => {
        if (ICON_BY_ID[icon]) return icon;

        const found = ICONS.find(item => item.file === icon);

        return found ? found.id : 'RU_MECH';
    });
}

function getIcon(id) {
    return ICON_BY_ID[id] || ICON_BY_ID.RU_MECH;
}

function detectIcons(title) {
    const text = title.toUpperCase();
    const found = [];

    const rules = [
        [/ТАНК|ЧУГУН|ARMORED/, 'RU_TANK'],
        [/ВДВ|VDV/, 'RU_VDV'],
        [/МОРЕ|ЯКОРЬ|MORSK|NAVY/, 'RU_MORSKAYA'],
        [/ПЕХОТ|БЕРЕГ|ШИЛК|MOTO/, 'RU_MOTOSTRELKI'],
        [/АИР|AIR|MECH/, 'RU_MECH'],
        [/МАРИН|MARIN/, 'US_MARINES'],
        [/СОКОМ|SOCOM|SOF/, 'US_SOF'],
        [/CAVALRY|КАВАЛ/, 'US_CAVALRY'],
        [/AIRMOBILE|ВЕРТО/, 'US_AIRMOBILE']
    ];

    rules.forEach(([regexp, icon]) => {
        if (regexp.test(text) && !found.includes(icon)) {
            found.push(icon);
        }
    });

    while (found.length < 2) {
        found.push('RU_MECH');
    }

    return found.slice(0, 2);
}

function normalizeLoadedOrder(order) {
    if (typeof order === 'string') {
        const parsed = parseTitle(order);
        return makeOrder(parsed.title, parsed.qty || 1, detectIcons(parsed.title));
    }

    return {
        id: order.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
        title: order.title || 'Без названия',
        qty: normalizeQty(order.qty),
        icons: normalizeIcons(order.icons || detectIcons(order.title || '')),
        done: Boolean(order.done)
    };
}

function load() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (saved) {
            return JSON.parse(saved).map(normalizeLoadedOrder);
        }
    } catch {}

    return defaultOrders.map(order => {
        return makeOrder(order.title, order.qty, order.icons);
    });
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}