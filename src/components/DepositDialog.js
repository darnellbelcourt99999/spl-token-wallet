import React, { useState } from 'react';
import {
  Modal,
  Button,
  Tabs,
  Input,
  Space,
  Typography,
  Steps,
  Avatar,
  Divider,
} from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import QRCode from 'qrcode.react';
import { abbreviateAddress } from '../utils/utils';
import {
  useIsProdNetwork,
  useSolanaExplorerUrlSuffix,
} from '../utils/connection';
import { useAsyncData } from '../utils/fetch-loop';
import tuple from 'immutable-tuple';
import { showSwapAddress } from '../utils/config';
import { useCallAsync } from '../utils/notifications';
import { swapApiRequest } from '../utils/swap/api';
import {
  ConnectToMetamaskButton,
  getErc20Balance,
  swapErc20ToSpl,
  useEthAccount,
} from '../utils/swap/eth';
import { Text, WarningBox } from './layout/StyledComponents';

const { TabPane } = Tabs;
const { Paragraph } = Typography;
const { Step } = Steps;

export default function DepositDialog({
  open,
  onClose,
  publicKey,
  balanceInfo,
}) {
  const isProdNetwork = useIsProdNetwork();
  const urlSuffix = useSolanaExplorerUrlSuffix();
  const { mint, tokenName, tokenSymbol, owner } = balanceInfo;
  const [tab, setTab] = useState('0');
  const [swapInfo] = useAsyncData(async () => {
    if (!showSwapAddress || !isProdNetwork) {
      return null;
    }
    return await swapApiRequest(
      'POST',
      'swap_to',
      {
        blockchain: 'sol',
        coin: balanceInfo.mint?.toBase58(),
        address: publicKey.toBase58(),
      },
      { ignoreUserErrors: true },
    );
  }, [
    'swapInfo',
    isProdNetwork,
    balanceInfo.mint?.toBase58(),
    publicKey.toBase58(),
  ]);

  let tabs = null;
  if (swapInfo) {
    let firstTab = `SPL ${tokenSymbol ?? swapInfo.coin.ticker}`;
    let secondTab = swapInfo.coin.ticker;
    if (!mint) {
      firstTab = 'SOL';
    } else {
      secondTab = `${
        swapInfo.coin.erc20Contract ? 'ERC20' : 'Native'
      } ${secondTab}`;
    }
    tabs = (
      <Tabs activeKey={tab} onChange={setTab} centered>
        <TabPane tab={firstTab} key="0" />
        <TabPane tab={secondTab} key="1" />
      </Tabs>
    );
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar
            src={`/icons/${tokenSymbol?.toLowerCase()}.png`}
            style={{ marginRight: 16 }}
          />
          <span class="ant-modal-confirm-title">
            Deposit {tokenName ?? mint.toBase58()}
            {tokenSymbol ? ` (${tokenSymbol})` : null}
          </span>
        </div>
      }
      visible={open}
      onCancel={onClose}
      footer={null}
      width={650}
    >
      {tabs}
      <Space direction="vertical" style={{ display: 'flex' }}>
        {tab === '0' ? (
          <>
            {publicKey.equals(owner) ? (
              <WarningBox>
                This address can only be used to receive SOL. Do not send other
                tokens to this address.
              </WarningBox>
            ) : (
              <WarningBox>
                This address can only be used to receive{' '}
                {tokenSymbol ?? abbreviateAddress(mint)}. Do not send SOL to
                this address.
              </WarningBox>
            )}
            <div class="ant-statistic">
              <div class="ant-statistic-title">Deposit Address</div>
              <div class="ant-statistic-content">
                <Paragraph style={{ fontSize: 18, marginBottom: 0 }} copyable>
                  {publicKey.toBase58()}
                </Paragraph>
              </div>
            </div>
            <Button
              type="link"
              component="a"
              href={
                `https://explorer.solana.com/account/${publicKey.toBase58()}` +
                urlSuffix
              }
              target="_blank"
              rel="noopener"
            >
              View on Solana Explorer
            </Button>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <QRCode value={publicKey.toBase58()} size={256} includeMargin />
            </div>
          </>
        ) : (
          <SolletSwapDepositAddress
            balanceInfo={balanceInfo}
            swapInfo={swapInfo}
          />
        )}
      </Space>
      <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
      </Space>
    </Modal>
  );
}

function SolletSwapDepositAddress({ balanceInfo, swapInfo }) {
  if (!swapInfo) {
    return null;
  }

  const { blockchain, address, memo, coin } = swapInfo;
  const { mint, tokenName } = balanceInfo;

  if (blockchain === 'btc' && memo === null) {
    return (
      <Space direction="vertical" style={{ display: 'flex' }}>
        <Text>
          Native BTC can be converted to SPL {tokenName} by sending it to the
          following address:
        </Text>
        <Divider style={{ margin: '10px 0px' }} />
        <div class="ant-statistic">
          <div class="ant-statistic-title">Native BTC Deposit Address</div>
          <div class="ant-statistic-content">
            <Paragraph style={{ fontSize: 18, marginBottom: 0 }} copyable>
              {address}
            </Paragraph>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <QRCode value={address} size={256} includeMargin />
        </div>
      </Space>
    );
  }

  if (blockchain === 'eth') {
    return (
      <Space direction="vertical" style={{ display: 'flex' }}>
        <Text>
          {coin.erc20Contract ? 'ERC20' : 'Native'} {coin.ticker} can be
          converted to {mint ? 'SPL' : 'native'} {tokenName} via MetaMask.
        </Text>
        <MetamaskDeposit swapInfo={swapInfo} />
      </Space>
    );
  }

  return null;
}

function MetamaskDeposit({ swapInfo }) {
  const ethAccount = useEthAccount();
  const [amount, setAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState(null);
  const callAsync = useCallAsync();

  const {
    address: swapAddress,
    memo: destination,
    coin: { erc20Contract: erc20Address, ticker },
  } = swapInfo;

  const [maxAmount, maxAmountLoaded] = useAsyncData(async () => {
    if (ethAccount) {
      return Math.min(
        await getErc20Balance(ethAccount, erc20Address),
        swapInfo.maxSize ?? Infinity,
      );
    }
    return 0;
  }, tuple(getErc20Balance, ethAccount, erc20Address));

  if (!ethAccount) {
    return <ConnectToMetamaskButton />;
  }

  async function submit() {
    setSubmitted(true);
    setStatus({ step: 0 });
    await callAsync(
      (async () => {
        let parsedAmount = parseFloat(amount);

        if (!parsedAmount || parsedAmount > maxAmount || parsedAmount <= 0) {
          throw new Error('Invalid amount');
        }
        await swapErc20ToSpl({
          ethAccount,
          erc20Address,
          swapAddress,
          destination,
          amount,
          onStatusChange: (e) => setStatus((status) => ({ ...status, ...e })),
        });
      })(),
      { onError: () => setSubmitted(false) },
    );
  }

  if (!submitted) {
    return (
      <Space direction="vertical" style={{ display: 'flex' }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <Input
            placeholder="Amount"
            fullWidth
            type="number"
            suffix={ticker}
            value={amount}
            onChange={(e) => setAmount(e.target.value.trim())}
          />
          <Button type="primary" onClick={submit} disabled={!amount}>
            Convert
          </Button>
        </div>
        {maxAmountLoaded && (
          <Button
            type="primary"
            onClick={() => setAmount(maxAmount.toFixed(6))}
          >
            Max: {maxAmount.toFixed(6)}
          </Button>
        )}
      </Space>
    );
  }

  return (
    <>
      <Steps current={status.step} direction="vertical">
        <Step title="Approve Conversion" />
        <Step title="Send Funds" />
        <Step
          title="Wait for Confirmations"
          description={
            status.step === 2 && (
              <div>
                <span>
                  {status.confirms
                    ? `${status.confirms} / 12 Confirmations`
                    : 'Transaction Pending'}
                </span>
                <Button
                  type="link"
                  component="a"
                  href={`https://etherscan.io/tx/${status.txid}`}
                  target="_blank"
                  rel="noopener"
                >
                  View on Etherscan
                </Button>
              </div>
            )
          }
          icon={status.step === 2 && <LoadingOutlined />}
        />
      </Steps>
    </>
  );
}