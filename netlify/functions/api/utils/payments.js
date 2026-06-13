// Map of Nigerian bank names to Paystack bank codes
const BANK_CODES = {
  'access bank': '044',
  'citibank': '023',
  'ecobank': '050',
  'fidelity bank': '070',
  'first bank': '011',
  'first city monument bank': '214',
  'fcmb': '214',
  'globus bank': '00103',
  'gtbank': '058',
  'guaranty trust bank': '058',
  'heritage bank': '030',
  'keystone bank': '082',
  'polaris bank': '076',
  'providus bank': '101',
  'stanbic ibtc': '221',
  'standard chartered': '068',
  'sterling bank': '232',
  'suntrust bank': '100',
  'titan trust bank': '102',
  'union bank': '032',
  'united bank for africa': '033',
  'uba': '033',
  'unity bank': '215',
  'wema bank': '035',
  'zenith bank': '057',
  'opay': '999992',
  'palmpay': '999991',
  'kuda bank': '50211',
  'moniepoint': '50515',
};

const getBankCode = async (bankName) => {
  if (!bankName) throw new Error('Bank name is required');
  const normalized = bankName.toLowerCase().trim();
  const code = BANK_CODES[normalized];
  if (!code) throw new Error(`Bank code not found for: ${bankName}`);
  return code;
};

module.exports = { getBankCode };
