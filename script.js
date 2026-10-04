const menuStatus = document.getElementById('menu-status');
const refreshMenuButton = document.getElementById('atualizar-cardapio');
const menuTableBody = document.getElementById('menu-semanal');
const siteHeader = document.querySelector('.site-header');
const heroFoodImage = document.getElementById('hero-food-image');
let menuRefreshInProgress = false;
let bannerRefreshInProgress = false;
const weekdays = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
];

function updateHeaderOnScroll() {
  const isScrolled = window.scrollY > 10;
  siteHeader.classList.toggle('is-scrolled', isScrolled);

  if (!isScrolled) {
    siteHeader.classList.remove('is-on-dark');
    return;
  }

  const headerCenter = siteHeader.getBoundingClientRect().height / 2;
  const darkSections = [
    document.querySelector('.hero'),
    document.querySelector('.site-footer'),
  ];
  const isOnDarkSection = darkSections.some((section) => {
    if (!section) {
      return false;
    }

    const bounds = section.getBoundingClientRect();
    return bounds.top <= headerCenter && bounds.bottom > headerCenter;
  });

  siteHeader.classList.toggle('is-on-dark', isOnDarkSection);
}

window.addEventListener('scroll', updateHeaderOnScroll, { passive: true });
updateHeaderOnScroll();

async function refreshAnnouncementBanner() {
  const documentUrl = window.BANNER_DOC_URL;

  if (!documentUrl || bannerRefreshInProgress) {
    return;
  }

  bannerRefreshInProgress = true;

  try {
    const requestUrl = new URL(documentUrl);
    requestUrl.searchParams.set('_', Date.now().toString());
    const response = await fetch(requestUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`O Google Docs respondeu com HTTP ${response.status}.`);
    }

    const documentHtml = await response.text();
    const exportedDocument = new DOMParser().parseFromString(
      documentHtml,
      'text/html',
    );
    const imageSource = exportedDocument.body
      .querySelector('img[src^="data:image/"]')
      ?.getAttribute('src');

    if (!imageSource) {
      heroFoodImage.removeAttribute('src');
      heroFoodImage.parentElement.hidden = true;
      document.querySelector('.hero').classList.remove('has-image');
      return;
    }

    heroFoodImage.onload = () => {
      heroFoodImage.parentElement.hidden = false;
      document.querySelector('.hero').classList.add('has-image');
    };
    heroFoodImage.onerror = () => {
      console.error('Não foi possível carregar a imagem do Google Docs.');
      heroFoodImage.removeAttribute('src');
      heroFoodImage.parentElement.hidden = true;
      document.querySelector('.hero').classList.remove('has-image');
    };
    heroFoodImage.src = imageSource;
    if (heroFoodImage.complete && heroFoodImage.naturalWidth) {
      heroFoodImage.parentElement.hidden = false;
      document.querySelector('.hero').classList.add('has-image');
    }
  } catch (error) {
    console.error('Erro ao atualizar a faixa pelo Google Docs:', error);
  } finally {
    bannerRefreshInProgress = false;
  }
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];

    if (character === '"') {
      if (insideQuotes && csvText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === ',' && !insideQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && csvText[index + 1] === '\n') {
        index += 1;
      }
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (insideQuotes) {
    throw new Error('A planilha CSV contém aspas sem fechamento.');
  }

  row.push(field.trim());
  if (row.some((cell) => cell !== '')) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header) {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function validateMenuCsv(csvText) {
  const rows = parseCsv(csvText.replace(/^\uFEFF/, ''));

  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return (
      headers.includes('dia') &&
      (headers.includes('prato principal') || headers.includes('refeicao')) &&
      headers.includes('acompanhamento') &&
      headers.includes('sobremesa')
    );
  });

  if (headerIndex < 0 || rows.length <= headerIndex + 1) {
    throw new Error('A planilha precisa ter cabeçalho e refeições preenchidas.');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const dayColumn = headers.indexOf('dia');
  const principalColumn = headers.findIndex(
    (header) => header === 'prato principal' || header === 'refeicao',
  );
  const accompanimentColumn = headers.indexOf('acompanhamento');
  const dessertColumn = headers.indexOf('sobremesa');

  if ([dayColumn, principalColumn, accompanimentColumn, dessertColumn].includes(-1)) {
    throw new Error(
      'Confira se as colunas se chamam Dia, Prato Principal, Acompanhamento e Sobremesa.',
    );
  }

  const dayLookup = new Map(
    weekdays.map((day) => [normalizeHeader(day), day]),
  );
  const menu = rows.slice(headerIndex + 1)
    .filter((cells) => normalizeHeader(cells[dayColumn] || '') !== 'dia')
    .map((cells) => {
    const day = dayLookup.get(normalizeHeader(cells[dayColumn] || ''));
    const principal = (cells[principalColumn] || '').trim();
    const accompaniment = (cells[accompanimentColumn] || '').trim();
    const dessert = (cells[dessertColumn] || '').trim();

    if (!day) {
      throw new Error(
        'Confira se cada refeição tem um dia válido de segunda a sexta.',
      );
    }

    return { day, principal, accompaniment, dessert };
    });

  if (
    menu.length !== weekdays.length ||
    new Set(menu.map((item) => item.day)).size !== weekdays.length
  ) {
    throw new Error('A planilha precisa ter uma linha para cada dia, de segunda a sexta.');
  }

  return menu.sort(
    (first, second) => weekdays.indexOf(first.day) - weekdays.indexOf(second.day),
  );
}

function renderMenu(menu) {
  const fragment = document.createDocumentFragment();

  menu.forEach((item) => {
    const row = document.createElement('tr');
    const dayCell = document.createElement('td');
    dayCell.className = 'day';
    dayCell.textContent = item.day;

    [item.principal, item.accompaniment, item.dessert].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value || '—';
      row.append(cell);
    });

    row.prepend(dayCell);
    fragment.append(row);
  });

  menuTableBody.replaceChildren(fragment);
}

async function refreshMenu() {
  const csvUrl = window.CARDAPIO_CSV_URL.trim();

  if (!csvUrl) {
    return;
  }

  if (menuRefreshInProgress) {
    return;
  }

  menuRefreshInProgress = true;
  refreshMenuButton.disabled = true;
  refreshMenuButton.textContent = 'Atualizando...';
  menuStatus.textContent = 'Buscando o cardápio publicado...';

  try {
    const response = await fetch(csvUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`A planilha respondeu com HTTP ${response.status}.`);
    }

    const menu = validateMenuCsv(await response.text());
    renderMenu(menu);
    menuStatus.textContent = 'Cardápio atualizado.';
  } catch (error) {
    menuStatus.textContent =
      'Não foi possível atualizar pela planilha. Confira o link CSV e se ela foi publicada para leitura.';
    console.error('Erro ao atualizar o cardápio da planilha:', error);
  } finally {
    menuRefreshInProgress = false;
    refreshMenuButton.disabled = false;
    refreshMenuButton.textContent = 'Atualizar cardápio';
  }
}

if (window.CARDAPIO_CSV_URL.trim()) {
  refreshMenuButton.hidden = false;
  refreshMenu();
  window.setInterval(() => {
    if (!document.hidden) {
      refreshMenu();
    }
  }, 10 * 1000);
}

if (window.BANNER_DOC_URL) {
  refreshAnnouncementBanner();
  window.setInterval(() => {
    if (!document.hidden) {
      refreshAnnouncementBanner();
    }
  }, 60 * 1000);
}

refreshMenuButton.addEventListener('click', refreshMenu);

const suggestionForm = document.getElementById('formSugestao');
const suggestionMessage = document.getElementById('mensagem-sugestao');
const emailFallback = document.getElementById('link-email-sugestao');

suggestionForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!suggestionForm.reportValidity()) {
    return;
  }

  const suggestion = document.getElementById('texto-sugestao').value.trim();
  const subject = 'Sugestão para a merenda escolar';
  const body = `Olá!\n\nSugestão:\n${suggestion}`;
  const mailtoUrl =
    `mailto:leonorcardapio@gmail.com?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;
  const gmailUrl = new URL('https://mail.google.com/mail/');
  gmailUrl.search = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: 'leonorcardapio@gmail.com',
    su: subject,
    body,
  }).toString();

  emailFallback.href = mailtoUrl;
  emailFallback.hidden = false;
  suggestionMessage.textContent =
    'O Gmail foi aberto com a sugestão pronta. Revise a mensagem e clique em Enviar para encaminhá-la.';
  suggestionMessage.style.color = '#15803D';
  window.open(gmailUrl.toString(), '_blank', 'noopener,noreferrer');
});
