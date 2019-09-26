const puppeteer = require('puppeteer');
const yargs = require('yargs');
const fs = require('fs');
const csvStringify = require('csv-stringify');

const args = yargs.argv;

(async () => {
  const browser = await puppeteer.launch();
  await login(browser, { user: args.user, password: args.password });
  const registrants = await getRegistrantInfos(browser);
  await fillCompetitors(browser, registrants);
  await fillLodging(browser, registrants);
  await browser.close();

  if (args.json) {
    await fs.promises.writeFile(
      './result.json',
      JSON.stringify(Object.values(registrants), null, 2)
    );
  }
  if (args.csv) {
    csvStringify(Object.values(registrants), { header: true }, (err, output) =>
      fs.promises.writeFile('./result.csv', output)
    );
  }
})();

async function login(browser, { user, password }) {
  console.log('🕐 Logging in');
  const page = await browser.newPage();
  await page.goto('https://anmeldung.freestyledm2019.de/users/sign_in');
  await (await page.$('#user_email')).type(user);
  await (await page.$('#user_password')).type(password);
  await (await page.$('#user_email')).press('Enter');
  await page.waitForNavigation();
  await page.close();
  console.log('✔️ Done');
}

async function fillLodging(browser, registrants) {
  console.log('🕐 Filling Lodging Info');
  const page = await browser.newPage();
  await page.goto(
    'https://anmeldung.freestyledm2019.de/en/payment_summary/lodgings/1'
  );
  const rows = await page.$$('#DataTables_Table_0 tbody tr');

  for (const row of rows) {
    const cols = await row.$$('td');
    const selectionText = await (await cols[0].getProperty(
      'textContent'
    )).jsonValue();
    // console.log(await(await cols[2].getProperty('textContent')).jsonValue())
    const registrantId = (await (await (await cols[2].$('a')).getProperty(
      'href'
    )).jsonValue())
      .split('/')
      .pop();
    registrants[registrantId].üb15_16 = selectionText.includes('Nov 15,');
    registrants[registrantId].üb16_17 = selectionText.includes('Nov 17,');
  }
  await page.close();
  console.log('✔️ Done');
}

async function fillCompetitors(browser, registrants) {
  console.log('🕐 Filling Competitor Info');
  const page = await browser.newPage();
  await page.goto('https://anmeldung.freestyledm2019.de/results');
  const competitorLinks = await Promise.all(
    (await page.$$('tbody tr td:nth-child(3) a')).map(
      async a => await (await a.getProperty('href')).jsonValue()
    )
  );
  await page.close();


  await Promise.all(
    competitorLinks.map(competitorLink =>
      fillCompetitionCompetitors(browser, competitorLink, registrants)
    )
  );
  console.log('✔️ Done');
}

async function fillCompetitionCompetitors(browser, url, registrants) {
  const page = await browser.newPage();
  await page.goto(url);
  const compName = await (await (await page.$('#main h2')).getProperty(
    'textContent'
  )).jsonValue();
  let compType = '';
  if (compName.startsWith('Einzel')) compType = 'ek';
  if (compName.startsWith('Paar')) compType = 'pk';
  if (compName.startsWith('Kleingruppe')) compType = 'kg';
  if (compName.startsWith('Großgruppe')) compType = 'gg';

  const idCells = await page.$$('tbody tr td:first-child');

  for (const idCell of idCells) {
    const ids = (await (await idCell.getProperty(
      'textContent'
    )).jsonValue()).split(', ');
    for (const id of ids) {
      registrants[id][compType] = true;
    }
  }

  await page.close();
}

async function getRegistrantInfos(browser) {
  console.log('🕐 Loading Registrants');
  const page = await browser.newPage();
  await page.goto(
    'https://anmeldung.freestyledm2019.de/registrants/manage_all'
  );
  const rows = await page.$$('tbody tr');

  const registrants = {};

  for (const row of rows) {
    const columns = await row.$$('td');
    const columnText = await Promise.all(
      columns.map(
        async column =>
          await (await column.getProperty('textContent')).jsonValue()
      )
    );
    if (columnText[8] !== 'Deleted') {
      registrants[parseInt(columnText[0])] = {
        id: parseInt(columnText[0]),
        name: columnText[2] + ' ' + columnText[1],
        age: columnText[3],
        gender: columnText[4],
        club: columnText[5],
        mail: columnText[9],
        ek: false,
        pk: false,
        kg: false,
        gg: false,
        üb15_16: false,
        üb16_17: false
      };
    }
  }
  await page.close();
  console.log(`✔️ Done - ${Object.keys(registrants).length} Registrants loaded`);
  return registrants;
}
