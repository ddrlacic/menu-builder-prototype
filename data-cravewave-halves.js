window.POS_DATASETS = window.POS_DATASETS || {};
window.POS_DATASETS['cravewave-halves'] = (() => {
  let next = 910000100;
  const id = () => String(next++);
  const items = {};
  const add = (item) => {
    const key = id();
    items[key] = item;
    return key;
  };
  const group = (name, children, prices = {}, rules = {}) => add({ type: 'group', name, groupType: 1, min: 0, max: null, children, childPrices: prices, ...rules });
  const priced = (ids, price) => Object.fromEntries(ids.map((x) => [x, price]));

  const instructions = add({ type: 'product', name: 'Special Instructions', price: 0, children: [] });
  const note = group('Notes', [instructions], {}, { max: 1 });
  const option = (name, price = 0) => add({ type: 'product', name, price, children: [note] });

  const TOPPINGS = ['Classic Pepperoni', 'Italian Sausage', 'Smoked Ham', 'Mushrooms', 'Red Onion', 'Green Bell Pepper', 'Olives', 'Jalapeños'];
  const CHEESES = ['Extra Mozzarella', 'Feta', 'Provolone', 'Parmesan'];
  const whole = Object.fromEntries([...TOPPINGS, ...CHEESES].map((n) => [n, option(n)]));
  const halves = Object.fromEntries([...TOPPINGS, ...CHEESES].map((n) => [n, [option(`1st Half - ${n}`), option(`2nd Half - ${n}`)]]));
  const halvesOf = (names) => names.flatMap((n) => halves[n]);
  const base = Object.fromEntries(['Tomato Sauce', 'BBQ Sauce', 'Olive Oil', 'Mozzarella', 'Basil'].map((n) => [n, option(n)]));

  const sauce = group('Pizza Sauce', [base['Tomato Sauce'], base['BBQ Sauce'], base['Olive Oil']], {}, { min: 1, max: 1 });
  const online = group('Online Halves', halvesOf([...TOPPINGS, ...CHEESES]), priced(halvesOf([...TOPPINGS, ...CHEESES]), 1));

  const SIZES = [
    ['Small', 10, 1.5, 1.25],
    ['Medium', 12, 2, 1.75],
    ['Large', 14, 2.5, 2.25],
  ];
  const sizeGroups = Object.fromEntries(
    SIZES.map(([size, , topping, cheese]) => {
      const wholes = TOPPINGS.map((n) => whole[n]);
      const cheeses = CHEESES.map((n) => whole[n]);
      return [
        size,
        [
          group(`Add Toppings - ${size}`, wholes, priced(wholes, topping)),
          group(`Half Toppings - ${size}`, halvesOf(TOPPINGS), priced(halvesOf(TOPPINGS), topping / 2)),
          group(`${size} Cheese`, cheeses, priced(cheeses, cheese)),
          group(`${size} Cheese Halves`, halvesOf(CHEESES), priced(halvesOf(CHEESES), cheese / 2)),
        ],
      ];
    }),
  );

  const PIZZAS = [
    ['Classic Margherita', [base.Mozzarella, base.Basil], 11.99],
    ['Cravewave Pepperoni', [base.Mozzarella, whole['Classic Pepperoni']], 13.99],
    ['Garden Veggie', [whole.Mushrooms, whole['Red Onion'], whole['Green Bell Pepper'], whole.Olives], 13.49],
  ];
  const containers = PIZZAS.map(([name, ingredients, price]) => {
    const included = group(`${name} Ingredients`, ingredients);
    const sizes = SIZES.map(([size, inches], i) => add({ type: 'product', name: `${inches}" ${name}`, price: +(price + i * 3).toFixed(2), children: [included, sauce, ...sizeGroups[size], online, note] }));
    return { name, sizes, included, ingredients };
  });

  const toppingsCat = add({ type: 'category', name: 'Toppings', children: [...Object.values(whole), ...halvesOf([...TOPPINGS, ...CHEESES]), ...Object.values(base), instructions] });
  const pizzasCat = add({ type: 'category', name: 'Pizzas', children: containers.flatMap((c) => c.sizes) });

  const products = {};
  const groups = {};
  for (const [key, it] of Object.entries(items)) {
    if (it.type === 'product' && it.children.length) products[key] = { groups: it.children };
    if (it.type === 'group') groups[key] = { options: it.children, rules: { min: it.min, max: it.max, maxSingle: 1, freeCount: 0 } };
  }
  for (const c of containers) groups[c.included].preselected = Object.fromEntries(c.ingredients.map((x) => [x, 1]));

  return {
    modifierCodes: [['regular', 'Regular'], ['extra', 'Extra'], ['side', 'On the side']],
    posFocus: pizzasCat,
    pos: {
      syncedAt: null,
      syncCount: 0,
      priceGaps: {},
      menus: [{ id: 'default', name: 'Default Menu', roots: [pizzasCat, toppingsCat] }],
      items,
    },
    menu: {
      name: 'Default Menu',
      posExt: 'default',
      channels: ['mobile', 'web', 'call_center', 'kiosk'],
      orderTypes: ['preorder', 'take_out', 'delivery'],
      externalChannels: ['doordash', 'grubhub', 'ubereats'],
      schedule: [],
      categories: [{ pos: pizzasCat, products: [...containers.flatMap((c) => c.sizes.map((pos) => ({ pos, hidden: true }))), ...containers.map((c) => ({ container: c.name, sizes: c.sizes }))] }],
    },
    products,
    groups,
  };
})();
