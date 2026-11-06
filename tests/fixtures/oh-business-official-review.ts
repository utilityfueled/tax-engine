/** Source-first literal exact-blank rectangles and independent monetary originals; no candidate outputs. */
import {confirmGuidedOhioBusinessFacts} from '../../apps/web/src/lib/guided-ohio-business-facts';
import {confirmGuidedOhioResidencyFacts} from '../../apps/web/src/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '../../apps/web/src/lib/guided-ohio-payment-facts';
import {guidedOhioBusinessFixture} from './guided-ohio-business-sources';
import {buildGuidedStateOriginals} from '../../apps/web/src/lib/guided-state-engine-inputs';
export function businessPaperRequired<T>(v:T|undefined|null):T{if(v===undefined||v===null)throw Error('Explicit business physical original required');return v;}
export const businessPaperCases = [
 {name:'nr100k',status:'nonresident',profit:'100000',halfSE:'7065',federalAGI:'92935',BID:'92935',ohioAGI:'0',taxable:'0',tax:'0',apportioned:'31250',nrcRatio:'0.0000',NRC:'0'},
 {name:'nr400k',status:'nonresident',profit:'400000',halfSE:'16275',federalAGI:'383725',BID:'250000',ohioAGI:'133725',taxable:'131825',tax:'3955',apportioned:'125000',nrcRatio:'1.0000',NRC:'3955'},
 {name:'py100k',status:'part_year_resident',profit:'100000',halfSE:'7065',federalAGI:'92935',BID:'92935',ohioAGI:'0',taxable:'0',tax:'0',apportioned:'31250',nrcRatio:'0.0000',NRC:'0'},
 {name:'py400k',status:'part_year_resident',profit:'400000',halfSE:'16275',federalAGI:'383725',BID:'250000',ohioAGI:'133725',taxable:'131825',tax:'3955',apportioned:'125000',nrcRatio:'1.0000',NRC:'3955'},
] as const;
export type BusinessPaperCase=typeof businessPaperCases[number];
export function businessPaperFixture(c:BusinessPaperCase){const f=guidedOhioBusinessFixture(c.status,c.profit);const input=buildGuidedStateOriginals(f.input,f.state);if(!input.ohioResidency?.businessSources||!input.ohioPayments)throw Error('Existing actual business source replay must remain complete');return{input,facts:input.ohioResidency,payments:input.ohioPayments};}
export type BusinessPaperPacket=ReturnType<typeof businessPaperFixture>;
export const businessPhysicalSourceCells=[
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "TP_SSN",
    "rect": [
      39.751,
      656.833,
      123.298,
      670.154
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "SP_SSN",
    "rect": [
      256.758,
      656.833,
      338.68,
      670.154
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "SD_NUM",
    "rect": [
      489.344,
      656.833,
      521.821,
      670.154
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "TP_FN",
    "rect": [
      43.251,
      620.984,
      155.154,
      634.305
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "TP_MI",
    "rect": [
      250.278,
      620.984,
      260.895,
      634.305
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "TP_LN",
    "rect": [
      273.719,
      620.984,
      435.641,
      634.305
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "SP_FN",
    "rect": [
      43.251,
      584.654,
      155.154,
      597.975
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "SP_MI",
    "rect": [
      250.278,
      584.654,
      260.895,
      597.975
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "SP_LN",
    "rect": [
      272.83,
      584.654,
      434.752,
      597.975
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "ADDRESS1",
    "rect": [
      41.501,
      548.831,
      296.495,
      562.152
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "ADDRESS2",
    "rect": [
      41.501,
      513.393,
      296.495,
      526.714
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CITY",
    "rect": [
      41.251,
      478.458,
      188.034,
      491.779
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "STATE",
    "rect": [
      323.259,
      478.458,
      340.076,
      491.779
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "ZIP",
    "rect": [
      357.637,
      478.458,
      396.689,
      491.779
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "COUNTY",
    "rect": [
      437.119,
      478.458,
      469.732,
      491.779
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "FRGN_COUNTRY",
    "rect": [
      41.251,
      440.792,
      188.816,
      454.113
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "FRGN_ZIP",
    "rect": [
      322.28,
      440.792,
      387.362,
      454.113
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "PRIM_NON_RES_STATE",
    "rect": [
      264.818,
      406.659,
      281.875,
      419.4
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "SP_NON_RES_STATE",
    "rect": [
      264.818,
      371.596,
      281.875,
      384.337
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "SP_SSN_SEP",
    "rect": [
      473.723,
      358.717,
      555.553,
      370.865
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L1_NEG",
    "rect": [
      395.969,
      263.034,
      403.85,
      275.791
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L1",
    "rect": [
      488.486,
      263.036,
      570.864,
      276.357
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L2A",
    "rect": [
      488.486,
      238.855,
      570.864,
      252.176
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L2B",
    "rect": [
      488.486,
      215.227,
      570.864,
      228.548
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L3_NEG",
    "rect": [
      395.969,
      192.051,
      403.85,
      204.808
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L3",
    "rect": [
      488.486,
      190.243,
      570.864,
      203.564
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L4",
    "rect": [
      488.486,
      166.419,
      570.864,
      179.74
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L4_EXEMPT",
    "rect": [
      325.176,
      151.882,
      351.783,
      167.804
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L5",
    "rect": [
      488.486,
      142.45,
      570.864,
      155.771
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L6",
    "rect": [
      488.486,
      118.453,
      570.864,
      131.774
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "L7",
    "rect": [
      488.486,
      93.863,
      570.864,
      107.184
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "Date_Gen",
    "rect": [
      35.1502,
      718.565,
      96.843,
      732.253
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "TP_SSN1",
    "rect": [
      60.367,
      729.534,
      162.471,
      743.738
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L7a",
    "rect": [
      488.217,
      706.483,
      570.283,
      718.971
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L8A",
    "rect": [
      488.217,
      683.43,
      570.283,
      695.918
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L8B",
    "rect": [
      488.217,
      659.936,
      570.283,
      672.424
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L8C",
    "rect": [
      488.217,
      635.109,
      570.283,
      647.597
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L9",
    "rect": [
      488.217,
      611.313,
      570.283,
      623.801
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L10",
    "rect": [
      488.217,
      586.268,
      570.283,
      598.756
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L11",
    "rect": [
      488.217,
      563.236,
      570.283,
      575.724
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L12",
    "rect": [
      488.217,
      539.026,
      570.283,
      551.514
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L13",
    "rect": [
      488.217,
      515.205,
      570.283,
      527.693
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L14",
    "rect": [
      488.217,
      491.587,
      570.283,
      504.075
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L15",
    "rect": [
      488.217,
      467.689,
      570.283,
      480.177
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L16",
    "rect": [
      488.217,
      442.979,
      570.283,
      455.467
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L17",
    "rect": [
      488.217,
      418.394,
      570.283,
      430.882
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L18",
    "rect": [
      488.217,
      395.523,
      570.283,
      408.011
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L19_NEG",
    "rect": [
      415.989,
      373.497,
      422.811,
      385.249
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L19",
    "rect": [
      488.217,
      372.461,
      570.283,
      384.949
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L20",
    "rect": [
      488.217,
      347.976,
      570.283,
      360.464
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L21",
    "rect": [
      488.217,
      324.025,
      570.283,
      336.513
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L22",
    "rect": [
      488.217,
      299.894,
      570.283,
      312.382
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L23",
    "rect": [
      488.217,
      275.625,
      570.283,
      288.113
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L24",
    "rect": [
      488.217,
      251.939,
      570.283,
      264.427
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L25A",
    "rect": [
      76.813,
      214.645,
      109.867,
      227.133
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L25B",
    "rect": [
      199.425,
      214.645,
      232.479,
      227.133
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L25C",
    "rect": [
      308.48,
      214.645,
      341.534,
      227.133
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L25D",
    "rect": [
      76.813,
      179.908,
      109.867,
      192.396
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L25E",
    "rect": [
      199.425,
      179.908,
      232.479,
      192.396
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L25F",
    "rect": [
      307.48,
      179.908,
      340.534,
      192.396
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L25G",
    "rect": [
      488.217,
      201.922,
      570.283,
      214.41
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "L26",
    "rect": [
      488.217,
      154.387,
      570.283,
      166.875
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "PHONE_NUM",
    "rect": [
      317.124,
      104.645,
      410.187,
      117.133
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "SIGN_DATE",
    "rect": [
      285.875,
      89.708,
      354.349,
      102.196
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "PREPARER_PRINTED_NAME",
    "rect": [
      113.254,
      75.288,
      266.846,
      87.776
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "PREPARER_PHONE_NUM",
    "rect": [
      319.938,
      76.4775,
      415.064,
      88.311
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 2,
    "field": "PREPARER_TIN",
    "rect": [
      301.444,
      49.242,
      413.623,
      61.73
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "ssn",
    "rect": [
      253.473,
      701.596,
      356.76,
      719.198
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "prim-start",
    "rect": [
      36.773,
      622.14,
      120.67,
      636.192
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "prim-end",
    "rect": [
      146.438,
      622.153,
      230.335,
      636.204
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "spouse-start",
    "rect": [
      303.213,
      622.791,
      387.11,
      636.843
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "spouse-end",
    "rect": [
      412.878,
      622.804,
      496.775,
      636.855
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "1a",
    "rect": [
      372.997,
      494.236,
      463.777,
      507.7
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "1b",
    "rect": [
      487.394,
      495.712,
      578.174,
      509.176
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "2a",
    "rect": [
      372.997,
      481.251,
      463.777,
      494.715
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "2b",
    "rect": [
      487.394,
      480.727,
      578.174,
      494.191
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "3a",
    "rect": [
      372.997,
      467.251,
      463.777,
      480.715
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "3b",
    "rect": [
      487.394,
      467.727,
      578.174,
      481.191
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "4a",
    "rect": [
      372.997,
      453.251,
      463.777,
      466.715
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "4b",
    "rect": [
      487.394,
      454.727,
      578.174,
      468.191
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "5b",
    "rect": [
      487.394,
      444.266,
      578.174,
      456.191
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "6b",
    "rect": [
      487.394,
      431.139,
      578.174,
      442.448
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "Text1",
    "rect": [
      141.892,
      404.989,
      432.472,
      418.453
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "7b",
    "rect": [
      487.394,
      407.836,
      578.174,
      421.3
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "Text2",
    "rect": [
      150.818,
      370.559,
      431.384,
      381.005
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "8b",
    "rect": [
      487.394,
      372.501,
      578.174,
      385.966
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "9b",
    "rect": [
      487.394,
      358.592,
      578.174,
      372.057
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "10a",
    "rect": [
      373.346,
      326.258,
      464.126,
      339.722
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "10b",
    "rect": [
      487.394,
      326.4,
      578.174,
      339.865
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "11a",
    "rect": [
      373.346,
      312.389,
      464.126,
      325.854
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "11b",
    "rect": [
      487.394,
      312.531,
      578.174,
      325.996
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "12a",
    "rect": [
      373.346,
      300.389,
      464.126,
      311.083
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "12b",
    "rect": [
      487.394,
      299.531,
      578.174,
      312.996
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "13a",
    "rect": [
      373.346,
      286.298,
      464.126,
      299.763
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "13b",
    "rect": [
      487.394,
      286.44,
      578.174,
      299.905
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "Text4",
    "rect": [
      52.8868,
      246.277,
      334.901,
      261.189
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "14a",
    "rect": [
      373.346,
      250.396,
      464.126,
      263.861
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "14b",
    "rect": [
      487.394,
      251.538,
      578.174,
      265.003
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "15b",
    "rect": [
      487.009,
      239.644,
      577.789,
      250.338
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "16b",
    "rect": [
      487.394,
      204.714,
      578.174,
      218.179
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "17b",
    "rect": [
      487.394,
      180.411,
      578.174,
      193.876
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "18b",
    "rect": [
      487.394,
      155.33,
      578.174,
      168.795
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "19",
    "rect": [
      487.407,
      128.869,
      578.187,
      142.334
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 1,
    "field": "20",
    "rect": [
      487.407,
      103.788,
      578.187,
      117.253
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "ssn2",
    "rect": [
      80.3723,
      719.125,
      216.907,
      737.343
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs1",
    "rect": [
      99.4656,
      551.963,
      189.878,
      562.615
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "4",
    "rect": [
      236.851,
      551.963,
      327.263,
      562.615
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "5",
    "rect": [
      352.834,
      551.963,
      443.246,
      563.77
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "6",
    "rect": [
      468.372,
      551.963,
      558.784,
      562.615
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs2",
    "rect": [
      99.4656,
      537.415,
      189.878,
      548.068
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "7",
    "rect": [
      236.851,
      537.415,
      327.263,
      548.068
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "8",
    "rect": [
      352.834,
      537.805,
      443.246,
      548.458
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "9",
    "rect": [
      468.372,
      537.415,
      558.784,
      548.068
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs3",
    "rect": [
      99.4656,
      522.286,
      189.878,
      532.938
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "10",
    "rect": [
      236.851,
      522.286,
      327.263,
      532.938
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "11",
    "rect": [
      352.834,
      522.286,
      443.246,
      532.938
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "12",
    "rect": [
      468.351,
      522.286,
      558.763,
      532.938
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs4",
    "rect": [
      99.4656,
      507.106,
      189.878,
      517.758
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "13",
    "rect": [
      236.851,
      507.106,
      327.263,
      517.758
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "14",
    "rect": [
      352.834,
      507.106,
      443.246,
      517.758
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "15",
    "rect": [
      468.372,
      507.106,
      558.784,
      517.758
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs5",
    "rect": [
      99.4656,
      491.621,
      189.878,
      502.274
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "16",
    "rect": [
      236.851,
      491.621,
      327.263,
      502.274
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "17",
    "rect": [
      352.834,
      491.621,
      443.246,
      502.274
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "18",
    "rect": [
      468.372,
      491.621,
      558.784,
      502.274
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs6",
    "rect": [
      98.8131,
      476.624,
      189.225,
      487.276
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "19pg2",
    "rect": [
      236.851,
      476.624,
      327.263,
      487.276
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "20pg2",
    "rect": [
      352.834,
      476.624,
      443.246,
      487.276
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "21",
    "rect": [
      468.372,
      476.624,
      558.784,
      487.276
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs7",
    "rect": [
      99.4656,
      461.67,
      189.878,
      472.322
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "22",
    "rect": [
      236.851,
      461.67,
      327.263,
      472.322
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "23",
    "rect": [
      352.834,
      461.67,
      443.246,
      472.322
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "24",
    "rect": [
      468.372,
      461.67,
      558.784,
      472.322
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs8",
    "rect": [
      99.4656,
      446.336,
      189.878,
      456.989
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "25",
    "rect": [
      236.851,
      446.336,
      327.263,
      456.989
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "26",
    "rect": [
      352.834,
      446.336,
      443.246,
      456.989
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "27",
    "rect": [
      468.372,
      446.336,
      558.784,
      456.989
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs9",
    "rect": [
      99.4656,
      432.408,
      189.878,
      443.06
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "28",
    "rect": [
      236.851,
      432.408,
      327.263,
      443.06
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "29",
    "rect": [
      352.834,
      432.408,
      443.246,
      443.06
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "30",
    "rect": [
      468.372,
      432.408,
      558.784,
      443.06
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs10",
    "rect": [
      99.4656,
      416.439,
      189.878,
      427.092
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "31",
    "rect": [
      236.851,
      416.439,
      327.263,
      427.092
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "32",
    "rect": [
      352.834,
      416.439,
      443.246,
      427.092
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "33",
    "rect": [
      468.444,
      416.439,
      558.856,
      427.092
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs11",
    "rect": [
      99.4656,
      401.637,
      189.878,
      412.289
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "34",
    "rect": [
      236.851,
      401.637,
      327.263,
      412.289
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "35",
    "rect": [
      352.834,
      401.637,
      443.246,
      412.289
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "36",
    "rect": [
      468.351,
      401.637,
      558.763,
      412.289
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs12",
    "rect": [
      99.302,
      387.543,
      189.714,
      398.195
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "37",
    "rect": [
      236.851,
      387.543,
      327.263,
      398.195
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "38",
    "rect": [
      352.834,
      387.543,
      443.246,
      398.195
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "39",
    "rect": [
      468.351,
      387.543,
      558.763,
      398.195
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs13",
    "rect": [
      99.4656,
      371.469,
      189.878,
      382.121
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "40",
    "rect": [
      236.851,
      371.469,
      327.263,
      382.121
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "41",
    "rect": [
      352.834,
      371.469,
      443.246,
      382.121
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "42",
    "rect": [
      468.372,
      371.469,
      558.784,
      382.121
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs14",
    "rect": [
      99.4656,
      356.598,
      189.878,
      367.251
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "43",
    "rect": [
      236.851,
      356.598,
      327.263,
      367.251
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "44",
    "rect": [
      352.834,
      356.598,
      443.246,
      367.251
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "45",
    "rect": [
      468.372,
      356.598,
      558.784,
      367.251
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs15",
    "rect": [
      99.302,
      341.55,
      189.714,
      352.202
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "46",
    "rect": [
      236.851,
      341.55,
      327.263,
      352.202
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "47",
    "rect": [
      352.834,
      341.55,
      443.246,
      352.202
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "48",
    "rect": [
      468.372,
      341.55,
      558.784,
      352.202
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs16",
    "rect": [
      99.302,
      326.156,
      189.714,
      336.808
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "49",
    "rect": [
      236.851,
      326.156,
      327.263,
      336.808
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "50",
    "rect": [
      352.834,
      326.156,
      443.246,
      336.808
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "51",
    "rect": [
      468.372,
      326.156,
      558.784,
      336.808
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs17",
    "rect": [
      99.302,
      311.992,
      189.714,
      322.644
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "52",
    "rect": [
      236.851,
      311.992,
      327.263,
      322.644
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "53",
    "rect": [
      352.834,
      311.992,
      443.246,
      322.644
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "54",
    "rect": [
      468.372,
      311.992,
      558.784,
      322.644
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs18",
    "rect": [
      99.302,
      296.156,
      189.714,
      306.808
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "55",
    "rect": [
      236.851,
      296.156,
      327.263,
      306.808
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "56",
    "rect": [
      352.834,
      296.156,
      443.246,
      306.808
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "57",
    "rect": [
      468.372,
      296.156,
      558.784,
      306.808
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs19",
    "rect": [
      99.302,
      282.59,
      189.714,
      293.242
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "58",
    "rect": [
      236.851,
      282.59,
      327.263,
      293.242
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "59",
    "rect": [
      352.834,
      282.59,
      443.246,
      293.242
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "60",
    "rect": [
      468.372,
      282.59,
      558.784,
      293.242
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "fs20",
    "rect": [
      99.302,
      267.459,
      189.714,
      278.111
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "61",
    "rect": [
      236.851,
      267.459,
      327.263,
      278.111
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "62",
    "rect": [
      352.834,
      267.459,
      443.246,
      278.111
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "63",
    "rect": [
      468.372,
      267.459,
      558.784,
      278.111
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "64",
    "rect": [
      236.851,
      237.043,
      327.263,
      247.695
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "65",
    "rect": [
      352.834,
      237.043,
      443.246,
      247.695
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "66",
    "rect": [
      468.372,
      237.043,
      558.784,
      247.695
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "67",
    "rect": [
      236.851,
      207.031,
      327.263,
      217.683
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "68",
    "rect": [
      352.834,
      207.031,
      443.246,
      217.683
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "69",
    "rect": [
      468.351,
      207.031,
      558.763,
      217.683
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "81",
    "rect": [
      468.382,
      137.611,
      558.266,
      150.892
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 2,
    "field": "84",
    "rect": [
      468.372,
      98.9231,
      558.266,
      111.539
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "ssn2",
    "rect": [
      80.6221,
      718.691,
      216.63,
      737.154
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3bn",
    "rect": [
      37.1093,
      642.071,
      315.061,
      657.274
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3perc",
    "rect": [
      417.435,
      643.611,
      475.204,
      658.379
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3fein",
    "rect": [
      495.31,
      643.611,
      574.654,
      658.379
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-1-1a",
    "rect": [
      199.368,
      531.921,
      272.339,
      545.288
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-1-2a",
    "rect": [
      289.551,
      531.536,
      362.523,
      545.288
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-1-1b",
    "rect": [
      198.934,
      516.838,
      271.905,
      529.819
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-1-2b",
    "rect": [
      289.117,
      517.097,
      362.088,
      529.693
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-1-1c",
    "rect": [
      198.862,
      502.141,
      271.834,
      514.737
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-1-2c",
    "rect": [
      289.046,
      502.4,
      362.017,
      514.997
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-1-3c",
    "rect": [
      379.321,
      502.373,
      452.292,
      514.969
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "Dropdown1",
    "rect": [
      457.791,
      502.238,
      497.438,
      516.075
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-1-5c",
    "rect": [
      519.551,
      503.307,
      569.936,
      515.903
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-2-1",
    "rect": [
      199.226,
      487.009,
      272.197,
      499.606
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-2-2",
    "rect": [
      289.409,
      487.269,
      362.38,
      499.865
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-2-3",
    "rect": [
      379.19,
      486.997,
      452.161,
      499.593
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "Dropdown2",
    "rect": [
      457.765,
      487.298,
      497.413,
      501.136
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-2-5",
    "rect": [
      519.42,
      487.276,
      570.239,
      499.873
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-3-1",
    "rect": [
      199.155,
      472.747,
      272.126,
      485.343
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-3-2",
    "rect": [
      289.338,
      473.006,
      362.309,
      485.603
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-3-3",
    "rect": [
      379.19,
      473.295,
      452.161,
      485.891
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "Dropdown3",
    "rect": [
      458.15,
      472.818,
      497.798,
      486.656
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-3-5",
    "rect": [
      519.42,
      472.902,
      569.805,
      485.499
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-4-5",
    "rect": [
      519.486,
      457.766,
      569.871,
      470.362
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-5-1",
    "rect": [
      466.902,
      402.919,
      558.551,
      414.647
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-5",
    "rect": [
      466.929,
      387.838,
      558.578,
      399.566
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-6",
    "rect": [
      466.765,
      372.746,
      558.414,
      384.473
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-7",
    "rect": [
      467.093,
      357.813,
      558.742,
      369.54
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-8",
    "rect": [
      466.929,
      333.047,
      558.578,
      344.775
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-9",
    "rect": [
      466.929,
      317.816,
      558.578,
      329.543
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-10",
    "rect": [
      467.256,
      303.051,
      558.905,
      314.779
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-11",
    "rect": [
      466.929,
      287.319,
      558.578,
      299.047
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-12",
    "rect": [
      467.093,
      272.572,
      558.742,
      284.299
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-13",
    "rect": [
      466.929,
      257.476,
      558.578,
      269.203
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-14",
    "rect": [
      467.093,
      242.402,
      558.742,
      254.13
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-15",
    "rect": [
      466.929,
      226.866,
      558.578,
      238.593
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-16",
    "rect": [
      467.093,
      212.773,
      558.742,
      224.501
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-17",
    "rect": [
      466.929,
      187.532,
      558.578,
      199.259
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-18",
    "rect": [
      469.093,
      126.809,
      560.742,
      138.537
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-19",
    "rect": [
      469.581,
      111.447,
      561.229,
      123.175
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-20",
    "rect": [
      469.581,
      96.537,
      561.229,
      108.264
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "3-21",
    "rect": [
      469.581,
      72.7683,
      561.229,
      84.4958
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "TP_SSN1",
    "rect": [
      265.029,
      696.099,
      347.454,
      709.853
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L1",
    "rect": [
      487.45,
      597.282,
      557.111,
      610.297
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L2_NEG",
    "rect": [
      423.816,
      575.743,
      431.865,
      588.159
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L2",
    "rect": [
      487.45,
      573.073,
      557.111,
      586.088
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L3_NEG",
    "rect": [
      423.816,
      551.534,
      431.865,
      563.95
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L3",
    "rect": [
      487.45,
      549.131,
      557.111,
      562.146
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L4_NEG",
    "rect": [
      423.816,
      527.216,
      431.865,
      539.632
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L4",
    "rect": [
      487.45,
      524.965,
      557.111,
      537.98
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L5",
    "rect": [
      487.45,
      489.647,
      557.111,
      502.662
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L6_NEG",
    "rect": [
      423.816,
      467.841,
      431.865,
      480.257
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L6",
    "rect": [
      487.45,
      466.394,
      557.111,
      479.409
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L7",
    "rect": [
      487.45,
      443.13,
      557.111,
      456.145
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L8",
    "rect": [
      487.45,
      419.419,
      557.111,
      432.434
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L9_NEG",
    "rect": [
      423.816,
      399.282,
      431.865,
      411.698
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L9",
    "rect": [
      487.45,
      395.018,
      557.111,
      408.033
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L10_NEG",
    "rect": [
      423.816,
      373.911,
      431.865,
      386.327
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L10",
    "rect": [
      487.45,
      370.905,
      557.111,
      383.92
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L11",
    "rect": [
      487.45,
      323.028,
      557.111,
      336.043
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L12",
    "rect": [
      487.45,
      299.585,
      557.111,
      312.6
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L13",
    "rect": [
      487.45,
      275.525,
      557.111,
      288.54
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L14",
    "rect": [
      487.45,
      227.416,
      557.111,
      240.431
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L15",
    "rect": [
      487.45,
      203.697,
      557.111,
      216.712
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 1,
    "field": "SchedITBUS_L16",
    "rect": [
      487.45,
      178.8,
      557.111,
      191.815
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "TP_SSN1",
    "rect": [
      61.5675,
      728.345,
      144.073,
      741.256
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L1_FEIN_SSN",
    "rect": [
      49.082,
      621.127,
      117.436,
      634.504
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L1_PRIM_PCT_INT",
    "rect": [
      164.353,
      621.127,
      218.234,
      634.504
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L1_SP_PCT_INT",
    "rect": [
      257.411,
      621.127,
      311.292,
      634.504
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L1_NAME",
    "rect": [
      49.082,
      585.162,
      346.357,
      598.539
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L2_FEIN_SSN",
    "rect": [
      49.082,
      550.389,
      117.436,
      563.766
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L2_PRIM_PCT_INT",
    "rect": [
      164.353,
      550.389,
      218.234,
      563.766
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L2_SP_PCT_INT",
    "rect": [
      257.411,
      550.389,
      311.292,
      563.766
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L2_NAME",
    "rect": [
      49.082,
      514.424,
      346.357,
      527.801
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L3_FEIN_SSN",
    "rect": [
      49.082,
      477.826,
      117.436,
      491.203
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L3_PRIM_PCT_INT",
    "rect": [
      164.353,
      477.498,
      218.234,
      490.875
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L3_SP_PCT_INT",
    "rect": [
      257.411,
      477.498,
      311.292,
      490.875
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L3_NAME",
    "rect": [
      49.082,
      441.861,
      346.357,
      455.238
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L4_FEIN_SSN",
    "rect": [
      49.082,
      406.047,
      117.436,
      419.424
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L4_PRIM_PCT_INT",
    "rect": [
      164.353,
      406.065,
      218.234,
      419.442
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L4_SP_PCT_INT",
    "rect": [
      257.411,
      406.501,
      311.292,
      419.878
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L4_NAME",
    "rect": [
      49.082,
      370.081,
      346.357,
      383.458
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L5_FEIN_SSN",
    "rect": [
      49.082,
      334.285,
      117.436,
      347.662
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L5_PRIM_PCT_INT",
    "rect": [
      164.353,
      334.285,
      218.234,
      347.662
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L5_SP_PCT_INT",
    "rect": [
      257.411,
      334.285,
      311.292,
      347.662
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L5_NAME",
    "rect": [
      49.082,
      297.32,
      346.357,
      310.697
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L6_FEIN_SSN",
    "rect": [
      49.082,
      262.547,
      117.436,
      275.924
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L6_PRIM_PCT_INT",
    "rect": [
      164.353,
      262.547,
      218.234,
      275.924
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L6_SP_PCT_INT",
    "rect": [
      257.411,
      262.547,
      311.292,
      275.924
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L6_NAME",
    "rect": [
      49.082,
      225.582,
      346.357,
      238.959
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L7_FEIN_SSN",
    "rect": [
      49.082,
      188.984,
      117.436,
      202.361
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L7_PRIM_PCT_INT",
    "rect": [
      164.353,
      188.984,
      218.234,
      202.361
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L7_SP_PCT_INT",
    "rect": [
      257.411,
      188.984,
      311.292,
      202.361
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L7_NAME",
    "rect": [
      49.082,
      153.019,
      346.357,
      166.396
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L8_FEIN_SSN",
    "rect": [
      49.082,
      118.205,
      117.436,
      131.582
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L8_PRIM_PCT_INT",
    "rect": [
      164.353,
      118.205,
      218.234,
      131.582
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L8_SP_PCT_INT",
    "rect": [
      257.411,
      118.205,
      311.292,
      131.582
    ]
  },
  {
    "file": "oh-schedule-business-income-review.pdf",
    "page": 2,
    "field": "SchedITBUS_L8_NAME",
    "rect": [
      49.082,
      81.239,
      346.357,
      94.616
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "TP_SSN1",
    "rect": [
      265.103,
      695.185,
      347.15,
      707.783
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L1",
    "rect": [
      510.394,
      646.908,
      579.929,
      659.506
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L2",
    "rect": [
      510.394,
      623.01,
      579.929,
      635.608
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L3",
    "rect": [
      510.394,
      599.74,
      579.929,
      612.338
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L4",
    "rect": [
      510.394,
      575.776,
      579.929,
      588.374
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L5",
    "rect": [
      510.394,
      551.858,
      579.929,
      564.456
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L6",
    "rect": [
      510.394,
      527.826,
      579.929,
      540.424
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L7",
    "rect": [
      510.394,
      503.859,
      579.929,
      516.457
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L8",
    "rect": [
      510.394,
      479.782,
      579.929,
      492.38
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L9",
    "rect": [
      510.394,
      443.752,
      579.929,
      456.35
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L10",
    "rect": [
      510.394,
      419.9,
      579.929,
      432.498
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L11",
    "rect": [
      510.394,
      395.918,
      579.929,
      408.515
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L12",
    "rect": [
      491.644,
      371.838,
      579.929,
      384.436
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L13",
    "rect": [
      510.394,
      322.887,
      578.929,
      335.485
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L14",
    "rect": [
      510.394,
      299.86,
      578.929,
      312.458
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L15",
    "rect": [
      510.394,
      274.871,
      578.929,
      287.469
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L16",
    "rect": [
      510.394,
      250.902,
      578.929,
      263.5
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L17",
    "rect": [
      510.394,
      226.807,
      578.929,
      239.405
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L18",
    "rect": [
      510.394,
      202.81,
      578.929,
      215.408
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L19",
    "rect": [
      510.394,
      178.934,
      578.929,
      191.532
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L20",
    "rect": [
      510.394,
      154.905,
      578.929,
      167.503
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L21",
    "rect": [
      510.394,
      130.788,
      578.929,
      143.386
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L22",
    "rect": [
      510.394,
      106.805,
      578.929,
      119.403
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L23",
    "rect": [
      510.394,
      84.657,
      578.929,
      98.277
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 1,
    "field": "SchedA_L24",
    "rect": [
      510.394,
      60.893,
      578.929,
      73.491
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "TP_SSN1",
    "rect": [
      61.9125,
      728.057,
      145.194,
      741.676
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L25",
    "rect": [
      488.045,
      695.697,
      577.957,
      709.317
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L26",
    "rect": [
      488.632,
      658.54,
      578.544,
      672.16
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L27",
    "rect": [
      488.632,
      633.918,
      578.544,
      647.538
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L28",
    "rect": [
      488.632,
      609.998,
      578.544,
      623.618
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L29",
    "rect": [
      488.632,
      586.419,
      578.544,
      600.039
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L30",
    "rect": [
      488.632,
      563.192,
      578.544,
      576.812
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L31",
    "rect": [
      488.632,
      539.453,
      578.544,
      553.073
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L32",
    "rect": [
      488.632,
      503.131,
      578.544,
      516.751
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L33",
    "rect": [
      488.632,
      479.259,
      578.544,
      492.879
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L34",
    "rect": [
      488.632,
      455.28,
      578.544,
      468.9
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L35",
    "rect": [
      488.632,
      430.673,
      578.544,
      444.293
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L36",
    "rect": [
      488.632,
      406.254,
      578.544,
      419.874
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L37",
    "rect": [
      488.632,
      369.89,
      578.544,
      383.51
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L38",
    "rect": [
      488.632,
      346.22,
      578.544,
      359.84
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L39",
    "rect": [
      488.632,
      322.369,
      578.544,
      335.989
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L40",
    "rect": [
      488.632,
      298.618,
      578.544,
      312.18
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L41",
    "rect": [
      488.632,
      274.665,
      578.544,
      288.227
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L42",
    "rect": [
      488.632,
      236.768,
      578.544,
      250.33
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L43",
    "rect": [
      488.632,
      211.837,
      578.544,
      225.399
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L44",
    "rect": [
      488.632,
      189.044,
      578.544,
      202.606
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L45",
    "rect": [
      488.632,
      168.251,
      576.918,
      181.813
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L46",
    "rect": [
      488.054,
      144.532,
      577.966,
      158.152
    ]
  },
  {
    "file": "oh-schedule-adjustments-review.pdf",
    "page": 2,
    "field": "SchedA_L47",
    "rect": [
      488.054,
      119.151,
      577.966,
      132.771
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "TP_SSN1",
    "rect": [
      264.394,
      717.247,
      347.019,
      729.504
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L1",
    "rect": [
      502.159,
      644.628,
      578.336,
      658.024
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L2",
    "rect": [
      502.159,
      620.153,
      578.336,
      633.549
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L3",
    "rect": [
      502.159,
      596.962,
      578.336,
      610.358
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L4",
    "rect": [
      502.159,
      572.407,
      578.336,
      585.803
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L5",
    "rect": [
      502.159,
      548.906,
      578.336,
      562.302
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L6",
    "rect": [
      502.159,
      524.328,
      578.336,
      537.724
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L7",
    "rect": [
      502.159,
      501.007,
      578.336,
      514.403
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L8",
    "rect": [
      502.159,
      476.851,
      578.336,
      490.247
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L9",
    "rect": [
      502.159,
      452.503,
      578.336,
      465.899
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L10",
    "rect": [
      502.159,
      428.262,
      578.336,
      441.658
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L11",
    "rect": [
      502.159,
      404.317,
      578.336,
      417.713
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L12_JFC",
    "rect": [
      203.59,
      379.338,
      226.49,
      396.331
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L12",
    "rect": [
      502.159,
      380.15,
      578.336,
      393.546
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L13",
    "rect": [
      502.159,
      356.788,
      578.336,
      370.184
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L14",
    "rect": [
      502.159,
      332.377,
      578.336,
      345.773
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L15",
    "rect": [
      502.159,
      308.185,
      578.336,
      321.581
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L16",
    "rect": [
      502.159,
      284.154,
      578.336,
      297.55
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L17",
    "rect": [
      502.159,
      260.842,
      578.336,
      274.238
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L18",
    "rect": [
      502.159,
      236.912,
      578.336,
      250.308
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L19",
    "rect": [
      502.159,
      213.178,
      578.336,
      226.574
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L20",
    "rect": [
      502.159,
      188.914,
      578.336,
      202.31
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L21",
    "rect": [
      502.159,
      166.018,
      578.336,
      179.414
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L22",
    "rect": [
      502.159,
      143.517,
      578.336,
      156.913
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L23",
    "rect": [
      502.159,
      119.585,
      578.336,
      132.981
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 1,
    "field": "SchedC_L24",
    "rect": [
      502.159,
      94.6225,
      578.336,
      108.018
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "TP_SSN1",
    "rect": [
      62.9356,
      727.399,
      146.357,
      742.274
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L25",
    "rect": [
      497.05,
      693.446,
      576.952,
      706.842
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L26",
    "rect": [
      497.675,
      669.432,
      577.577,
      682.828
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L27",
    "rect": [
      497.675,
      645.004,
      577.577,
      658.4
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L28",
    "rect": [
      497.675,
      621.354,
      577.577,
      634.75
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L29",
    "rect": [
      497.675,
      596.875,
      577.577,
      610.271
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L30",
    "rect": [
      497.675,
      573.858,
      577.577,
      587.254
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L31",
    "rect": [
      497.675,
      548.433,
      577.577,
      561.829
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L32",
    "rect": [
      497.675,
      526.184,
      577.577,
      539.029
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L33",
    "rect": [
      497.675,
      502.911,
      577.577,
      515.756
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L34",
    "rect": [
      497.675,
      477.827,
      577.577,
      490.672
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L35",
    "rect": [
      497.675,
      455.179,
      577.577,
      468.024
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L36",
    "rect": [
      497.675,
      431.636,
      577.577,
      444.481
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L37",
    "rect": [
      497.675,
      405.706,
      577.577,
      418.551
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L38",
    "rect": [
      497.675,
      371.629,
      577.577,
      384.801
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L39",
    "rect": [
      497.675,
      346.806,
      577.577,
      360.415
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L40",
    "rect": [
      497.675,
      323.498,
      577.577,
      337.107
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L41",
    "rect": [
      497.675,
      274.473,
      577.577,
      288.082
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L42",
    "rect": [
      497.675,
      250.609,
      577.577,
      264.218
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L43",
    "rect": [
      497.675,
      226.215,
      577.577,
      239.824
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L44",
    "rect": [
      497.675,
      202.297,
      577.577,
      215.906
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L45",
    "rect": [
      497.675,
      178.629,
      577.577,
      192.238
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L46",
    "rect": [
      497.675,
      155.297,
      577.577,
      168.906
    ]
  },
  {
    "file": "oh-schedule-credits-review.pdf",
    "page": 2,
    "field": "SchedC_L47",
    "rect": [
      497.675,
      131.297,
      577.577,
      144.906
    ]
  }
] as const;
export const businessPhysicalGroupSources=[
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_PRIM_RES",
    "rect": [
      36.075,
      407.416,
      44.25,
      420.284
    ],
    "rawRect": [
      36.075,
      407.416,
      44.25,
      420.284
    ],
    "APOnValues": [
      "/1"
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_PRIM_RES",
    "rect": [
      108.374,
      407.416,
      116.549,
      420.284
    ],
    "rawRect": [
      108.374,
      407.416,
      116.549,
      420.284
    ],
    "APOnValues": [
      "/2"
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_PRIM_RES",
    "rect": [
      179.555,
      407.416,
      187.73,
      420.284
    ],
    "rawRect": [
      179.555,
      407.416,
      187.73,
      420.284
    ],
    "APOnValues": [
      "/3"
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_FILING_STATUS",
    "rect": [
      330.723,
      406.407,
      338.898,
      419.275
    ],
    "rawRect": [
      330.723,
      419.275,
      338.898,
      406.407
    ],
    "APOnValues": [
      "/1"
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_FILING_STATUS",
    "rect": [
      330.749,
      382.043,
      338.924,
      394.911
    ],
    "rawRect": [
      330.749,
      394.911,
      338.924,
      382.043
    ],
    "APOnValues": [
      "/2"
    ]
  },
  {
    "file": "oh-it-1040-review.pdf",
    "page": 1,
    "field": "CHK_FILING_STATUS",
    "rect": [
      330.875,
      359.348,
      339.05,
      372.216
    ],
    "rawRect": [
      330.875,
      359.348,
      339.05,
      372.216
    ],
    "APOnValues": [
      "/3"
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "Check Box1",
    "rect": [
      340.164,
      661.33,
      351.392,
      672.865
    ],
    "rawRect": [
      340.164,
      661.33,
      351.392,
      672.865
    ],
    "APOnValues": [
      "/1"
    ]
  },
  {
    "file": "oh-it-nrc-review.pdf",
    "page": 3,
    "field": "Check Box1",
    "rect": [
      340.38,
      645.055,
      351.608,
      656.591
    ],
    "rawRect": [
      340.38,
      645.055,
      351.608,
      656.591
    ],
    "APOnValues": [
      "/2"
    ]
  }
] as const;
export const businessPaperCommonValues={
  "oh-schedule-adjustments-review.pdf:SchedA_L1": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L2": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L3": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L4": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L5": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L6": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L7": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L8": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L9": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L10": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L11": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L12": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L13": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L14": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L15": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L16": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L17": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L18": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L19": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L20": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L21": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L22": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L23": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L24": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L25": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L26": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L27": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L28": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L29": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L30": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L31": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L32": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L33": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L34": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L35": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L36": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L37": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L38": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L39": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L40": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L41": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L42": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L43": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L44": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L45": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L46": "0",
  "oh-schedule-adjustments-review.pdf:SchedA_L47": "0",
  "oh-schedule-credits-review.pdf:SchedC_L1": "0",
  "oh-schedule-credits-review.pdf:SchedC_L2": "0",
  "oh-schedule-credits-review.pdf:SchedC_L3": "0",
  "oh-schedule-credits-review.pdf:SchedC_L4": "0",
  "oh-schedule-credits-review.pdf:SchedC_L5": "0",
  "oh-schedule-credits-review.pdf:SchedC_L6": "0",
  "oh-schedule-credits-review.pdf:SchedC_L7": "0",
  "oh-schedule-credits-review.pdf:SchedC_L8": "0",
  "oh-schedule-credits-review.pdf:SchedC_L9": "0",
  "oh-schedule-credits-review.pdf:SchedC_L10": "0",
  "oh-schedule-credits-review.pdf:SchedC_L11": "0",
  "oh-schedule-credits-review.pdf:SchedC_L12": "0",
  "oh-schedule-credits-review.pdf:SchedC_L13": "0",
  "oh-schedule-credits-review.pdf:SchedC_L14": "0",
  "oh-schedule-credits-review.pdf:SchedC_L15": "0",
  "oh-schedule-credits-review.pdf:SchedC_L16": "0",
  "oh-schedule-credits-review.pdf:SchedC_L17": "0",
  "oh-schedule-credits-review.pdf:SchedC_L18": "0",
  "oh-schedule-credits-review.pdf:SchedC_L19": "0",
  "oh-schedule-credits-review.pdf:SchedC_L20": "0",
  "oh-schedule-credits-review.pdf:SchedC_L21": "0",
  "oh-schedule-credits-review.pdf:SchedC_L22": "0",
  "oh-schedule-credits-review.pdf:SchedC_L23": "0",
  "oh-schedule-credits-review.pdf:SchedC_L24": "0",
  "oh-schedule-credits-review.pdf:SchedC_L25": "0",
  "oh-schedule-credits-review.pdf:SchedC_L26": "0",
  "oh-schedule-credits-review.pdf:SchedC_L27": "0",
  "oh-schedule-credits-review.pdf:SchedC_L28": "0",
  "oh-schedule-credits-review.pdf:SchedC_L29": "0",
  "oh-schedule-credits-review.pdf:SchedC_L30": "0",
  "oh-schedule-credits-review.pdf:SchedC_L31": "0",
  "oh-schedule-credits-review.pdf:SchedC_L32": "0",
  "oh-schedule-credits-review.pdf:SchedC_L33": "0",
  "oh-schedule-credits-review.pdf:SchedC_L34": "0",
  "oh-schedule-credits-review.pdf:SchedC_L35": "0",
  "oh-schedule-credits-review.pdf:SchedC_L36": "0",
  "oh-schedule-credits-review.pdf:SchedC_L37": "0",
  "oh-schedule-credits-review.pdf:SchedC_L38": "0",
  "oh-schedule-credits-review.pdf:SchedC_L39": "0",
  "oh-schedule-credits-review.pdf:SchedC_L40": "0",
  "oh-schedule-credits-review.pdf:SchedC_L41": "0",
  "oh-schedule-credits-review.pdf:SchedC_L42": "0",
  "oh-schedule-credits-review.pdf:SchedC_L43": "0",
  "oh-schedule-credits-review.pdf:SchedC_L44": "0",
  "oh-schedule-credits-review.pdf:SchedC_L45": "0",
  "oh-schedule-credits-review.pdf:SchedC_L46": "0",
  "oh-schedule-credits-review.pdf:SchedC_L47": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L1": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L2": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L3": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L4": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L5": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L6": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L7": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L8": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L9": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L10": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L11": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L12": "250000",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L13": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L14": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L15": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L16": "0",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L1_NAME": "FICTIONAL OHIOCONSULTANT",
  "oh-schedule-business-income-review.pdf:SchedITBUS_L1_PRIM_PCT_INT": "100",
  "oh-it-nrc-review.pdf:1b": "0",
  "oh-it-nrc-review.pdf:2b": "0",
  "oh-it-nrc-review.pdf:3b": "0",
  "oh-it-nrc-review.pdf:4b": "0",
  "oh-it-nrc-review.pdf:5b": "0",
  "oh-it-nrc-review.pdf:6b": "0",
  "oh-it-nrc-review.pdf:7b": "0",
  "oh-it-nrc-review.pdf:8b": "0",
  "oh-it-nrc-review.pdf:9b": "0",
  "oh-it-nrc-review.pdf:17b": "0",
  "oh-it-nrc-review.pdf:1a": "0",
  "oh-it-nrc-review.pdf:2a": "0",
  "oh-it-nrc-review.pdf:3a": "0",
  "oh-it-nrc-review.pdf:4a": "0",
  "oh-it-nrc-review.pdf:3-5-1": "0",
  "oh-it-nrc-review.pdf:3-6": "0",
  "oh-it-nrc-review.pdf:3-7": "0",
  "oh-it-nrc-review.pdf:3-8": "0",
  "oh-it-nrc-review.pdf:3-9": "0",
  "oh-it-nrc-review.pdf:3-10": "0",
  "oh-it-nrc-review.pdf:3-11": "0",
  "oh-it-nrc-review.pdf:3-12": "0",
  "oh-it-nrc-review.pdf:3-15": "0",
  "oh-it-nrc-review.pdf:3-16": "0",
  "oh-it-nrc-review.pdf:3-18": "0",
  "oh-it-nrc-review.pdf:3-19": "0",
  "oh-it-nrc-review.pdf:3-20": "0",
  "oh-it-nrc-review.pdf:3-21": "0",
  "oh-it-nrc-review.pdf:3-1-1b": "0",
  "oh-it-nrc-review.pdf:3-1-2b": "0",
  "oh-it-nrc-review.pdf:3-2-1": "0",
  "oh-it-nrc-review.pdf:3-2-2": "0",
  "oh-it-nrc-review.pdf:3-2-5": "0",
  "oh-it-nrc-review.pdf:5": "0",
  "oh-it-nrc-review.pdf:68": "0",
  "oh-it-nrc-review.pdf:3bn": "FICTIONAL CURRENT ORDINARY SERVICES",
  "oh-it-nrc-review.pdf:3perc": "100",
  "oh-it-nrc-review.pdf:3-1-1a": "10000",
  "oh-it-nrc-review.pdf:3-1-2a": "20000",
  "oh-it-nrc-review.pdf:3-1-1c": "10000",
  "oh-it-nrc-review.pdf:3-1-2c": "20000",
  "oh-it-nrc-review.pdf:3-1-3c": ".500000",
  "oh-it-nrc-review.pdf:Dropdown1": "0.25",
  "oh-it-nrc-review.pdf:Dropdown2": "0.00",
  "oh-it-nrc-review.pdf:Dropdown3": "0.75",
  "oh-it-nrc-review.pdf:3-1-5c": ".125000",
  "oh-it-nrc-review.pdf:3-3-3": ".250000",
  "oh-it-nrc-review.pdf:3-3-5": ".187500",
  "oh-it-nrc-review.pdf:3-4-5": ".312500"
} as const;
export const businessPaperCaseValues={
  "nr100k": {
    "oh-schedule-business-income-review.pdf:SchedITBUS_L2": "100000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L10": "100000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L11": "92935",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L13": "92935",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L14": "",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L15": "",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L16": "",
    "oh-schedule-adjustments-review.pdf:SchedA_L13": "92935",
    "oh-schedule-adjustments-review.pdf:SchedA_L47": "92935",
    "oh-schedule-credits-review.pdf:SchedC_L37": "0",
    "oh-schedule-credits-review.pdf:SchedC_L38": "0",
    "oh-schedule-credits-review.pdf:SchedC_L40": "0",
    "oh-it-nrc-review.pdf:4": "100000",
    "oh-it-nrc-review.pdf:6": "31250",
    "oh-it-nrc-review.pdf:67": "100000",
    "oh-it-nrc-review.pdf:69": "31250",
    "oh-it-nrc-review.pdf:81": "92935",
    "oh-it-nrc-review.pdf:84": "0",
    "oh-it-nrc-review.pdf:3-5": "100000",
    "oh-it-nrc-review.pdf:3-13": "100000",
    "oh-it-nrc-review.pdf:3-14": "31250",
    "oh-it-nrc-review.pdf:3-17": "31250",
    "oh-it-nrc-review.pdf:3-3-1": "25000",
    "oh-it-nrc-review.pdf:3-3-2": "100000",
    "oh-it-nrc-review.pdf:16b": "0",
    "oh-it-nrc-review.pdf:18b": "0",
    "oh-it-nrc-review.pdf:19": ".0000",
    "oh-it-nrc-review.pdf:20": "0",
    "oh-it-1040-review.pdf:TP_FN": "FICTIONAL",
    "oh-it-1040-review.pdf:TP_LN": "OHIOCONSULTANT",
    "oh-it-1040-review.pdf:ADDRESS1": "100 FICTIONAL SOURCE STREET",
    "oh-it-1040-review.pdf:CITY": "RICHMOND",
    "oh-it-1040-review.pdf:STATE": "VA",
    "oh-it-1040-review.pdf:ZIP": "23219",
    "oh-it-1040-review.pdf:SD_NUM": "9999",
    "oh-it-1040-review.pdf:PRIM_NON_RES_STATE": "VA",
    "oh-it-1040-review.pdf:L1": "92935",
    "oh-it-1040-review.pdf:L2B": "92935",
    "oh-it-1040-review.pdf:L3": "0",
    "oh-it-1040-review.pdf:L4": "1900",
    "oh-it-1040-review.pdf:L4_EXEMPT": "1",
    "oh-it-1040-review.pdf:L5": "0",
    "oh-it-1040-review.pdf:L6": "0",
    "oh-it-1040-review.pdf:L7": "0",
    "oh-it-1040-review.pdf:L7a": "0",
    "oh-it-1040-review.pdf:L8A": "0",
    "oh-it-1040-review.pdf:L8B": "0",
    "oh-it-1040-review.pdf:L8C": "0",
    "oh-it-1040-review.pdf:L9": "0",
    "oh-it-1040-review.pdf:L10": "0",
    "oh-it-1040-review.pdf:L11": "0",
    "oh-it-1040-review.pdf:L12": "0",
    "oh-it-1040-review.pdf:L13": "0",
    "oh-it-1040-review.pdf:L14": "0",
    "oh-it-1040-review.pdf:L15": "0",
    "oh-it-1040-review.pdf:L16": "0",
    "oh-it-1040-review.pdf:L17": "0",
    "oh-it-1040-review.pdf:L19": "0",
    "oh-it-1040-review.pdf:L20": "0",
    "oh-it-1040-review.pdf:L21": "0",
    "oh-it-1040-review.pdf:L22": "0",
    "oh-it-1040-review.pdf:L23": "0",
    "oh-it-1040-review.pdf:L24": "0",
    "oh-it-1040-review.pdf:L25A": "0",
    "oh-it-1040-review.pdf:L25B": "0",
    "oh-it-1040-review.pdf:L25C": "0",
    "oh-it-1040-review.pdf:L25D": "0",
    "oh-it-1040-review.pdf:L25E": "0",
    "oh-it-1040-review.pdf:L25F": "0",
    "oh-it-1040-review.pdf:L25G": "0",
    "oh-it-1040-review.pdf:L26": "0"
  },
  "nr400k": {
    "oh-schedule-business-income-review.pdf:SchedITBUS_L2": "400000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L10": "400000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L11": "383725",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L13": "250000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L14": "133725",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L15": "131825",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L16": "3955",
    "oh-schedule-adjustments-review.pdf:SchedA_L13": "250000",
    "oh-schedule-adjustments-review.pdf:SchedA_L47": "250000",
    "oh-schedule-credits-review.pdf:SchedC_L1": "3955",
    "oh-schedule-credits-review.pdf:SchedC_L11": "3955",
    "oh-schedule-credits-review.pdf:SchedC_L37": "3955",
    "oh-schedule-credits-review.pdf:SchedC_L38": "3955",
    "oh-schedule-credits-review.pdf:SchedC_L40": "3955",
    "oh-it-nrc-review.pdf:4": "400000",
    "oh-it-nrc-review.pdf:6": "125000",
    "oh-it-nrc-review.pdf:67": "400000",
    "oh-it-nrc-review.pdf:69": "125000",
    "oh-it-nrc-review.pdf:81": "250000",
    "oh-it-nrc-review.pdf:84": "0",
    "oh-it-nrc-review.pdf:3-5": "400000",
    "oh-it-nrc-review.pdf:3-13": "400000",
    "oh-it-nrc-review.pdf:3-14": "125000",
    "oh-it-nrc-review.pdf:3-17": "125000",
    "oh-it-nrc-review.pdf:3-3-1": "100000",
    "oh-it-nrc-review.pdf:3-3-2": "400000",
    "oh-it-nrc-review.pdf:16b": "133725",
    "oh-it-nrc-review.pdf:18b": "133725",
    "oh-it-nrc-review.pdf:19": "1",
    "oh-it-nrc-review.pdf:20": "3955",
    "oh-it-1040-review.pdf:TP_FN": "FICTIONAL",
    "oh-it-1040-review.pdf:TP_LN": "OHIOCONSULTANT",
    "oh-it-1040-review.pdf:ADDRESS1": "100 FICTIONAL SOURCE STREET",
    "oh-it-1040-review.pdf:CITY": "RICHMOND",
    "oh-it-1040-review.pdf:STATE": "VA",
    "oh-it-1040-review.pdf:ZIP": "23219",
    "oh-it-1040-review.pdf:SD_NUM": "9999",
    "oh-it-1040-review.pdf:PRIM_NON_RES_STATE": "VA",
    "oh-it-1040-review.pdf:L1": "383725",
    "oh-it-1040-review.pdf:L2B": "250000",
    "oh-it-1040-review.pdf:L3": "133725",
    "oh-it-1040-review.pdf:L4": "1900",
    "oh-it-1040-review.pdf:L4_EXEMPT": "1",
    "oh-it-1040-review.pdf:L5": "131825",
    "oh-it-1040-review.pdf:L6": "131825",
    "oh-it-1040-review.pdf:L7": "0",
    "oh-it-1040-review.pdf:L7a": "0",
    "oh-it-1040-review.pdf:L8A": "0",
    "oh-it-1040-review.pdf:L8B": "3955",
    "oh-it-1040-review.pdf:L8C": "3955",
    "oh-it-1040-review.pdf:L9": "3955",
    "oh-it-1040-review.pdf:L10": "0",
    "oh-it-1040-review.pdf:L11": "0",
    "oh-it-1040-review.pdf:L12": "0",
    "oh-it-1040-review.pdf:L13": "0",
    "oh-it-1040-review.pdf:L14": "0",
    "oh-it-1040-review.pdf:L15": "0",
    "oh-it-1040-review.pdf:L16": "0",
    "oh-it-1040-review.pdf:L17": "0",
    "oh-it-1040-review.pdf:L19": "0",
    "oh-it-1040-review.pdf:L20": "0",
    "oh-it-1040-review.pdf:L21": "0",
    "oh-it-1040-review.pdf:L22": "0",
    "oh-it-1040-review.pdf:L23": "0",
    "oh-it-1040-review.pdf:L24": "0",
    "oh-it-1040-review.pdf:L25A": "0",
    "oh-it-1040-review.pdf:L25B": "0",
    "oh-it-1040-review.pdf:L25C": "0",
    "oh-it-1040-review.pdf:L25D": "0",
    "oh-it-1040-review.pdf:L25E": "0",
    "oh-it-1040-review.pdf:L25F": "0",
    "oh-it-1040-review.pdf:L25G": "0",
    "oh-it-1040-review.pdf:L26": "0"
  },
  "py100k": {
    "oh-schedule-business-income-review.pdf:SchedITBUS_L2": "100000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L10": "100000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L11": "92935",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L13": "92935",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L14": "",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L15": "",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L16": "",
    "oh-schedule-adjustments-review.pdf:SchedA_L13": "92935",
    "oh-schedule-adjustments-review.pdf:SchedA_L47": "92935",
    "oh-schedule-credits-review.pdf:SchedC_L37": "0",
    "oh-schedule-credits-review.pdf:SchedC_L38": "0",
    "oh-schedule-credits-review.pdf:SchedC_L40": "0",
    "oh-it-nrc-review.pdf:4": "100000",
    "oh-it-nrc-review.pdf:6": "31250",
    "oh-it-nrc-review.pdf:67": "100000",
    "oh-it-nrc-review.pdf:69": "31250",
    "oh-it-nrc-review.pdf:81": "92935",
    "oh-it-nrc-review.pdf:84": "0",
    "oh-it-nrc-review.pdf:3-5": "100000",
    "oh-it-nrc-review.pdf:3-13": "100000",
    "oh-it-nrc-review.pdf:3-14": "31250",
    "oh-it-nrc-review.pdf:3-17": "31250",
    "oh-it-nrc-review.pdf:3-3-1": "25000",
    "oh-it-nrc-review.pdf:3-3-2": "100000",
    "oh-it-nrc-review.pdf:16b": "0",
    "oh-it-nrc-review.pdf:18b": "0",
    "oh-it-nrc-review.pdf:19": ".0000",
    "oh-it-nrc-review.pdf:20": "0",
    "oh-it-nrc-review.pdf:prim-start": "01 01 25",
    "oh-it-nrc-review.pdf:prim-end": "06 30 25",
    "oh-it-nrc-review.pdf:14a": "7065",
    "oh-it-nrc-review.pdf:10a": "0",
    "oh-it-nrc-review.pdf:10b": "0",
    "oh-it-nrc-review.pdf:11a": "0",
    "oh-it-nrc-review.pdf:11b": "0",
    "oh-it-nrc-review.pdf:12a": "0",
    "oh-it-nrc-review.pdf:12b": "0",
    "oh-it-nrc-review.pdf:13a": "0",
    "oh-it-nrc-review.pdf:13b": "0",
    "oh-it-nrc-review.pdf:14b": "0",
    "oh-it-nrc-review.pdf:15b": "0"
  },
  "py400k": {
    "oh-schedule-business-income-review.pdf:SchedITBUS_L2": "400000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L10": "400000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L11": "383725",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L13": "250000",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L14": "133725",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L15": "131825",
    "oh-schedule-business-income-review.pdf:SchedITBUS_L16": "3955",
    "oh-schedule-adjustments-review.pdf:SchedA_L13": "250000",
    "oh-schedule-adjustments-review.pdf:SchedA_L47": "250000",
    "oh-schedule-credits-review.pdf:SchedC_L1": "3955",
    "oh-schedule-credits-review.pdf:SchedC_L11": "3955",
    "oh-schedule-credits-review.pdf:SchedC_L37": "3955",
    "oh-schedule-credits-review.pdf:SchedC_L38": "3955",
    "oh-schedule-credits-review.pdf:SchedC_L40": "3955",
    "oh-it-nrc-review.pdf:4": "400000",
    "oh-it-nrc-review.pdf:6": "125000",
    "oh-it-nrc-review.pdf:67": "400000",
    "oh-it-nrc-review.pdf:69": "125000",
    "oh-it-nrc-review.pdf:81": "250000",
    "oh-it-nrc-review.pdf:84": "0",
    "oh-it-nrc-review.pdf:3-5": "400000",
    "oh-it-nrc-review.pdf:3-13": "400000",
    "oh-it-nrc-review.pdf:3-14": "125000",
    "oh-it-nrc-review.pdf:3-17": "125000",
    "oh-it-nrc-review.pdf:3-3-1": "100000",
    "oh-it-nrc-review.pdf:3-3-2": "400000",
    "oh-it-nrc-review.pdf:16b": "133725",
    "oh-it-nrc-review.pdf:18b": "133725",
    "oh-it-nrc-review.pdf:19": "1",
    "oh-it-nrc-review.pdf:20": "3955",
    "oh-it-nrc-review.pdf:prim-start": "01 01 25",
    "oh-it-nrc-review.pdf:prim-end": "06 30 25",
    "oh-it-nrc-review.pdf:14a": "16275",
    "oh-it-nrc-review.pdf:10a": "0",
    "oh-it-nrc-review.pdf:10b": "0",
    "oh-it-nrc-review.pdf:11a": "0",
    "oh-it-nrc-review.pdf:11b": "0",
    "oh-it-nrc-review.pdf:12a": "0",
    "oh-it-nrc-review.pdf:12b": "0",
    "oh-it-nrc-review.pdf:13a": "0",
    "oh-it-nrc-review.pdf:13b": "0",
    "oh-it-nrc-review.pdf:14b": "0",
    "oh-it-nrc-review.pdf:15b": "0"
  }
} as const;
export function businessPaperPlans(c:BusinessPaperCase):Record<string,number>{return{...(c.status==='nonresident'?{'oh-it-1040-review.pdf':2}:{}),'oh-it-nrc-review.pdf':3,'oh-schedule-business-income-review.pdf':2,'oh-schedule-adjustments-review.pdf':2,'oh-schedule-credits-review.pdf':2};}
export function businessPaperCells(c:BusinessPaperCase){const common:Readonly<Record<string,string>>=businessPaperCommonValues;const values:Readonly<Record<string,string>>=businessPaperCaseValues[c.name];const plans=businessPaperPlans(c);return businessPhysicalSourceCells.filter(row=>row.file in plans).map(row=>({...row,value:values[row.file+':'+row.field]??common[row.file+':'+row.field]??''}));}
/** Printed original .20/.20/.60 anchors from exact NRCIII text before output; corrected field APs are independent above. */
export const businessPaperWeightStrikeRegions = [
 {original:'.20',rect:[458.8,503.2477,475.3,512.2477]},
 {original:'.20',rect:[458.8,488.2477,475.3,497.2477]},
 {original:'.60',rect:[458.64,473.6877,475.14,482.6877]},
] as const;

/** All source group widgets, including explicitly unselected alternatives. */
export function businessPaperGroupStatuses(c:BusinessPaperCase){const plans=businessPaperPlans(c);return businessPhysicalGroupSources.filter(row=>Object.hasOwn(plans,row.file)).map(row=>({...row,selected:(row.field==='CHK_PRIM_RES'&&row.APOnValues[0]==='/3')||(row.field==='CHK_FILING_STATUS'&&row.APOnValues[0]==='/1')||(row.field==='Check Box1'&&row.APOnValues[0]==='/1')}));}

/** Private-description originals are supplied and explicitly confirmed before rendering. */
export const businessPrivateDescriptionCases=['ssn-formatted','ssn-compact','ssn-separated','actual-ein','actual-source-reference','actual-original-document']as const;
export function businessPrivateDescriptionFixture(kind:typeof businessPrivateDescriptionCases[number]){
 const f=guidedOhioBusinessFixture('nonresident','100000'),input=structuredClone(f.input),state=structuredClone(f.state),current=businessPaperRequired(input.scheduleC),data=businessPaperRequired(state.sectionData['state-return']),parent=businessPaperRequired(data.ohioResidency),child=businessPaperRequired(parent.businessSources);
 current.ein='90-7000411';
 const receipt=businessPaperRequired(child.receiptOriginals[0]);
 // These fictional original identities are authored before any explicit capture.
 if(child.sourceReference.length>24)child.sourceReference='PRIVATE-SOURCE-2025';
 if(receipt.originalDocumentId.length>24)receipt.originalDocumentId='PRIVATE-DOC-2025';
 const marker=kind==='ssn-formatted'?input.taxpayer.primary.ssn:kind==='ssn-compact'?input.taxpayer.primary.ssn.replace(/\D/g,''):kind==='ssn-separated'?'900 70 0411':kind==='actual-ein'?current.ein:kind==='actual-source-reference'?child.sourceReference:receipt.originalDocumentId;
 current.principalBusinessActivity='CONSULTING '+marker;
 if(current.principalBusinessActivity.length>35)throw Error('Actual unmasked private description must fit the pinned NRC3bn35 character constraint');
 const business=confirmGuidedOhioBusinessFacts(input,child),residency=confirmGuidedOhioResidencyFacts(input,{...parent,businessSources:business}),payments=confirmGuidedOhioPaymentFacts(input,data.ohioPayments);
 state.sectionData['state-return']={...data,ohioResidency:residency,ohioPayments:payments};
 const actual=buildGuidedStateOriginals(input,state);
 if(!actual.ohioResidency?.businessSources||!actual.ohioPayments)throw Error('Explicit private-description sources must replay canonically');
 return{input:actual,facts:actual.ohioResidency,payments:actual.ohioPayments,privateMarker:marker,rawDescription:current.principalBusinessActivity,expectedDescription:'CONSULTING [REDACTED]'};
}
