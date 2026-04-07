# Crypto Exchange CSV Import Template

You are helping a taxpayer import their cryptocurrency transaction history from exchange CSV exports into our tax engine's input format.

## Your Task

Parse the provided CSV file and convert it to our tax engine's JSON schema format. The output must conform to either `Form1099DA` (for dispositions) or `CapitalTransaction` schemas, plus `CryptoMiningIncome`, `CryptoStakingIncome`, or `CryptoAirdropIncome` for income events.

## Exchange Format Detection

Identify the exchange by examining the CSV headers:

### Coinbase
- Headers: `Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes`
- Transaction Types: `Buy`, `Sell`, `Send`, `Receive`, `Convert`, `Staking Income`, `Learning Reward`, `Coinbase Earn`

### Coinbase Pro (Advanced Trade)
- Headers: `portfolio,trade id,product,side,created at,size,size unit,price,fee,total,price/fee/total unit`
- Side: `BUY`, `SELL`

### Kraken
- Headers: `txid,refid,time,type,subtype,aclass,asset,amount,fee,balance`
- Types: `trade`, `staking`, `deposit`, `withdrawal`

### Binance
- Headers: `Date(UTC),Pair,Side,Price,Executed,Amount,Fee`
- Side: `BUY`, `SELL`

### Gemini
- Headers: `Date,Time (UTC),Type,Symbol,Specification,Liquidity Indicator,Trading Fee Rate,Quantity,Price,Fee,Fee Currency,USD Amount,Trade ID,Order ID,Order Date,Order Time,Client Order ID,API Session,Tx Hash,Deposit Destination,Deposit Tx Output,Withdrawal Destination,Withdrawal Tx Output`
- Types: `Buy`, `Sell`, `Credit`, `Debit`

### Crypto.com
- Headers: `Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind`
- Transaction Kinds: `crypto_purchase`, `crypto_sale`, `crypto_earn_program_created`, `referral_gift`, `airdrop_to_exchange_transfer`

### KuCoin
- Headers: `oid,symbol,dealPrice,dealValue,amount,fee,direction,createdDate`
- Direction: `BUY`, `SELL`

## Output Schema

### For dispositions (sales/exchanges) — Form 1099-DA format:
```json
{
  "form1099DA": [{
    "brokerName": "Exchange Name",
    "transactions": [{
      "digitalAssetName": "Bitcoin",
      "ticker": "BTC",
      "dateAcquired": "YYYY-MM-DD",
      "dateSold": "YYYY-MM-DD",
      "proceeds": "10000.00",
      "costBasis": "5000.00",
      "holdingPeriod": "short|long",
      "basisReportedToIRS": false,
      "transactionType": "sale|exchange|payment|gift"
    }]
  }]
}
```

### For mining income:
```json
{
  "cryptoIncome": {
    "miningIncome": [{
      "asset": "BTC",
      "dateReceived": "YYYY-MM-DD",
      "quantity": "0.00125",
      "fairMarketValuePerUnit": "40000.00",
      "poolFees": "5.00"
    }],
    "isMiningBusiness": false
  }
}
```

### For staking income:
```json
{
  "cryptoIncome": {
    "stakingIncome": [{
      "asset": "ETH",
      "dateReceived": "YYYY-MM-DD",
      "quantity": "0.01",
      "fairMarketValuePerUnit": "3000.00"
    }],
    "isStakingBusiness": false
  }
}
```

### For airdrops:
```json
{
  "cryptoIncome": {
    "airdropIncome": [{
      "asset": "UNI",
      "dateReceived": "YYYY-MM-DD",
      "quantity": "400",
      "fairMarketValuePerUnit": "5.00",
      "source": "airdrop"
    }]
  }
}
```

## Processing Rules

1. **Date formats**: Normalize all dates to `YYYY-MM-DD`
2. **Monetary values**: Convert all amounts to USD decimal strings (no currency symbols)
3. **Fees**: For buy transactions, add fees to cost basis. For sell transactions, subtract fees from proceeds.
4. **Crypto-to-crypto exchanges**: Treat as two transactions — a sale of the source asset and a purchase of the destination asset
5. **Holding period**: If acquisition date is available, compute holding period. If unknown, mark as `"short"` (conservative)
6. **Cost basis**: If not determinable from the CSV, set to `"0"` and mark `basisReportedToIRS: false`
7. **Staking rewards**: Map to `stakingIncome` array
8. **Learning rewards / referral bonuses**: Map to `airdropIncome` with source `"promotional"`
9. **Ignore**: Deposits, withdrawals (transfers between wallets are not taxable events)

## Important Notes

- Always ask the user which exchange the CSV is from if not obvious from headers
- Flag any transactions that can't be cleanly mapped and explain why
- If the CSV contains both buys and sells, only the sells generate Form 8949 entries; buys establish cost basis lots
- For Convert transactions (Coinbase), treat as sale of source + purchase of destination
