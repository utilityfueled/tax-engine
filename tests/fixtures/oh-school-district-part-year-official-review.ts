/** Spec: state/oh-school-district-part-year-official-review.yaml. NEW fictional supplied county records before output. */
import type {TaxYearInput} from '@/models/inputs';
import type {OhioReturnHeaderSources} from '@/models/ohio-return-header-sources';
import {schoolDistrictPartYearFixture,rawPartYearSchoolOriginals} from './oh-school-district-part-year-sources';
export const schoolPyPaperCases=[{name:'refund100',withheld:'600',refund:'100'},{name:'covered',withheld:'500',refund:'0'}]as const;
export type SchoolPyPaperCase=typeof schoolPyPaperCases[number];
export function sdPyRequired<T>(v:T|null|undefined):T{if(v==null)throw Error('Actual fictional PY school original required');return v;}
export const schoolPyPlans={'oh-sd-100-review.pdf':3,'oh-sd-withholding-review.pdf':1}as const;
/** Explicit authored documentary facts, not geolocation or new source capture on read. */
export function schoolPyHeaderPacket(c:SchoolPyPaperCase=sdPyRequired(schoolPyPaperCases[0])){
 const canonical=schoolDistrictPartYearFixture(c.withheld),original=rawPartYearSchoolOriginals(canonical),identity={firstName:'Avery',lastName:'DistrictJuly',ssn:'900-74-0302',dateOfBirth:'1990-01-15'};
 const address={street:'302 Fictional July District Lane',city:'Ashland',state:'OH',zip:'44805'};
 const header:OhioReturnHeaderSources={taxYear:2025,sourceReference:'PRIVATE-PY-SCHOOL-HEADER-2025',asOfDate:'2026-04-01',sourceFactsConfirmed:true,owner:{accountHolder:'primary',originalTaxpayer:identity},originalFederalSources:structuredClone(original),originalOhioResidencySources:structuredClone(canonical.ohioResidency),originalOhioPaymentSources:structuredClone(canonical.ohioPayments),
  residence:{sourceReference:'PRIVATE-PY-SCHOOL-OH-HOME-212',originalAddress:structuredClone(address),periods:[{from:'2025-01-01',through:'2025-07-31',sourceReference:'PRIVATE-PY-SCHOOL-OH-PERIOD-212'}],allOhioResidentialPeriodsIncludedConfirmed:true},
  finderOriginal:{sourceReference:'PRIVATE-PY-SCHOOL-SUPPLIED-FINDER-COUNTY',taxYear:2025,lookupDate:'2025-07-31',originalAddress:structuredClone(address),districtCode:'0302',districtName:'Hillsdale LSD',countyName:'Ashland',schoolIncomeTax:'reported',officialResultMatchedConfirmed:true},
  countyOriginal:{sourceReference:'PRIVATE-PY-SCHOOL-SUPPLIED-COUNTY-ORIGINAL',taxYear:2025,recordDate:'2025-07-31',originalAddress:structuredClone(address),countyName:'Ashland'},
  officialInventoryOriginal:{sourceReference:'PRIVATE-PY-SCHOOL-OFFICIAL-ROW-2025',taxYear:2025,publication:'ohio_2025_it1040_booklet',publicationSha256:'931b21e7484ba96e561cf2346d8a7d2a8005bd990724b5903c9a90acede5f50e',printedPage:51,districtCode:'0302',districtName:'Hillsdale LSD',rateDisplay:'.0125',taxBaseDisplay:'E',officialRowReviewedConfirmed:true}};
 const withHeader:TaxYearInput={...structuredClone(canonical),ohioReturnHeaderSources:structuredClone(header)};return{canonical,original,header,withHeader};
}
export interface SchoolPyCell{file:string;page:number;field:string;rect:number[];value:string}
export interface SchoolPyStatus{file:string;page:number;field:string;rect:number[];APOnValues:string[];selected:boolean}
// Direct pinned original widget coordinates. All unnamed/static source labels remain source artwork.
const sourceTextCells:SchoolPyCell[]=[
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "TP_SSN",
    "rect": [
      40.3383,
      657.177,
      126.21,
      670.865
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SP_SSN",
    "rect": [
      254.284,
      657.177,
      340.156,
      670.865
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "TP_FN",
    "rect": [
      41.288,
      619.855,
      152.638,
      635.605
    ],
    "value": "AVERY"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "TP_MI",
    "rect": [
      247.124,
      619.855,
      262.829,
      635.605
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "TP_LN",
    "rect": [
      271.512,
      619.855,
      433.599,
      635.605
    ],
    "value": "DISTRICTJULY"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SP_FN",
    "rect": [
      42.288,
      583.595,
      153.638,
      599.345
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SP_MI",
    "rect": [
      248.138,
      583.595,
      263.827,
      599.345
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SP_LN",
    "rect": [
      271.512,
      583.595,
      433.599,
      599.345
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "ADDRESS1",
    "rect": [
      40.845,
      548.0,
      297.471,
      563.75
    ],
    "value": "153 FICTIONAL VIRGINIA SERVICE LANE"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "ADDRESS2",
    "rect": [
      40.845,
      511.458,
      297.471,
      527.208
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "CITY",
    "rect": [
      40.845,
      475.859,
      189.479,
      491.609
    ],
    "value": "RICHMOND"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "STATE",
    "rect": [
      321.923,
      475.859,
      347.53,
      491.609
    ],
    "value": "VA"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "ZIP",
    "rect": [
      359.425,
      475.859,
      427.12,
      491.609
    ],
    "value": "23219"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "COUNTY",
    "rect": [
      437.727,
      475.859,
      470.709,
      491.609
    ],
    "value": "ASHL"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "FRGN_COUNTRY",
    "rect": [
      40.845,
      440.001,
      189.479,
      455.751
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "FRGN_ZIP",
    "rect": [
      321.985,
      440.001,
      419.195,
      455.751
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SP_SSN_SEP",
    "rect": [
      442.124,
      403.344,
      525.834,
      419.094
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SD_NUM0",
    "rect": [
      40.8641,
      320.81,
      73.8131,
      336.793
    ],
    "value": "0302"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_END0",
    "rect": [
      167.9,
      321.043,
      213.404,
      336.793
    ],
    "value": "07-31"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "day0",
    "rect": [
      237.818,
      321.043,
      265.636,
      336.793
    ],
    "value": "212"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "res_factor0",
    "rect": [
      309.381,
      322.211,
      356.4,
      336.793
    ],
    "value": ".5808"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SD_NUM1A",
    "rect": [
      41.4186,
      284.717,
      73.7131,
      300.7
    ],
    "value": "9999"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_START1",
    "rect": [
      105.889,
      284.717,
      151.393,
      300.7
    ],
    "value": "08-01"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_END1",
    "rect": [
      168.454,
      284.95,
      213.958,
      300.7
    ],
    "value": "12-31"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "day1",
    "rect": [
      238.254,
      284.95,
      266.072,
      300.7
    ],
    "value": "153"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "res_factor1",
    "rect": [
      309.381,
      285.51,
      356.4,
      300.092
    ],
    "value": ".4191"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SD_NUM2",
    "rect": [
      41.4186,
      249.173,
      74.3676,
      265.156
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_START2",
    "rect": [
      105.889,
      249.173,
      151.393,
      265.156
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_END2",
    "rect": [
      168.454,
      249.173,
      213.958,
      265.156
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "day2",
    "rect": [
      237.818,
      249.406,
      265.636,
      265.156
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "res_factor2",
    "rect": [
      309.381,
      251.183,
      356.4,
      265.765
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SD_NUM3",
    "rect": [
      41.4186,
      212.159,
      74.3676,
      228.142
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_START3",
    "rect": [
      105.889,
      212.159,
      151.393,
      228.142
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_END3",
    "rect": [
      168.454,
      212.159,
      213.958,
      228.142
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "day3",
    "rect": [
      237.818,
      212.392,
      265.636,
      228.142
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "res_factor3",
    "rect": [
      309.381,
      213.801,
      356.4,
      228.383
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SD_NUM4",
    "rect": [
      41.4186,
      177.144,
      74.3676,
      193.127
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_START4",
    "rect": [
      105.889,
      177.144,
      151.393,
      193.127
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_END4",
    "rect": [
      168.454,
      177.144,
      213.958,
      193.127
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "day4",
    "rect": [
      237.818,
      177.377,
      265.636,
      193.127
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "res_factor4",
    "rect": [
      309.381,
      178.601,
      356.4,
      193.183
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SD_NUM5",
    "rect": [
      41.4186,
      141.13,
      74.3676,
      157.113
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_START5",
    "rect": [
      105.889,
      141.13,
      151.393,
      157.113
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "RES_END5",
    "rect": [
      168.454,
      141.13,
      213.958,
      157.113
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "day5",
    "rect": [
      237.818,
      141.363,
      265.636,
      157.113
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "res_factor5",
    "rect": [
      309.381,
      142.529,
      356.4,
      157.11
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "Date_Gen",
    "rect": [
      35.1502,
      718.565,
      96.843,
      732.253
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "TP_SSN1",
    "rect": [
      70.8243,
      728.336,
      154.591,
      746.336
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L1_NEG",
    "rect": [
      392.799,
      682.701,
      407.199,
      697.101
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L1",
    "rect": [
      465.188,
      679.479,
      578.126,
      697.479
    ],
    "value": "60000"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L2",
    "rect": [
      466.188,
      655.189,
      579.126,
      673.189
    ],
    "value": "0"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L3",
    "rect": [
      466.188,
      631.815,
      579.126,
      649.815
    ],
    "value": "60000"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L4",
    "rect": [
      465.333,
      607.922,
      578.271,
      625.922
    ],
    "value": "2150"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L5",
    "rect": [
      466.103,
      584.041,
      579.041,
      602.041
    ],
    "value": "57850"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L6",
    "rect": [
      466.103,
      536.888,
      579.041,
      554.888
    ],
    "value": "0"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L7",
    "rect": [
      509.452,
      512.755,
      577.555,
      530.755
    ],
    "value": "500"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L8",
    "rect": [
      509.452,
      488.901,
      577.555,
      506.901
    ],
    "value": "500"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L9",
    "rect": [
      509.452,
      465.091,
      577.555,
      483.091
    ],
    "value": "0"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L10",
    "rect": [
      509.452,
      440.855,
      577.555,
      458.855
    ],
    "value": "500"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L11",
    "rect": [
      509.452,
      417.344,
      577.555,
      435.344
    ],
    "value": "600"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L12",
    "rect": [
      509.452,
      393.152,
      577.555,
      411.152
    ],
    "value": "0"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L14",
    "rect": [
      509.452,
      370.078,
      577.555,
      388.078
    ],
    "value": "600"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L15",
    "rect": [
      509.452,
      345.999,
      577.555,
      363.999
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L16_NEG",
    "rect": [
      423.188,
      324.63,
      437.588,
      339.03
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L16",
    "rect": [
      509.452,
      321.415,
      577.555,
      339.415
    ],
    "value": "600"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L17",
    "rect": [
      509.452,
      284.423,
      577.555,
      302.423
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L18",
    "rect": [
      509.452,
      260.973,
      577.555,
      278.973
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L19",
    "rect": [
      509.452,
      237.108,
      577.555,
      255.108
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L20",
    "rect": [
      509.452,
      214.269,
      577.555,
      232.269
    ],
    "value": "100"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L21",
    "rect": [
      509.452,
      189.83,
      577.555,
      207.83
    ],
    "value": "0"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "L22",
    "rect": [
      509.452,
      165.879,
      577.555,
      183.879
    ],
    "value": "100"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "PHONE_NUM",
    "rect": [
      317.614,
      105.572,
      417.303,
      118.892
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "SIGN_DATE",
    "rect": [
      291.388,
      89.988,
      359.775,
      102.948
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "PREPARER_PRINTED_NAME",
    "rect": [
      114.994,
      76.231,
      264.493,
      89.551
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "PREPARER_PHONE_NUM",
    "rect": [
      318.486,
      75.3583,
      417.303,
      89.551
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "PREPARER_TIN",
    "rect": [
      301.308,
      43.9148,
      363.521,
      61.9148
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "TP_SSN1",
    "rect": [
      70.8243,
      728.336,
      154.591,
      746.336
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLASD",
    "rect": [
      351.573,
      643.625,
      383.551,
      661.626
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA23",
    "rect": [
      315.698,
      619.625,
      398.676,
      637.626
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA24",
    "rect": [
      315.698,
      595.5,
      398.676,
      613.501
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA25",
    "rect": [
      365.749,
      571.4,
      397.727,
      589.401
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA26",
    "rect": [
      314.573,
      547.25,
      397.551,
      565.251
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA27",
    "rect": [
      316.698,
      523.875,
      399.676,
      541.876
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA28",
    "rect": [
      315.573,
      500.0,
      398.551,
      518.001
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLBSD",
    "rect": [
      530.947,
      644.0,
      562.926,
      662.001
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB23",
    "rect": [
      494.885,
      619.437,
      577.863,
      637.438
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB24",
    "rect": [
      494.885,
      595.312,
      577.863,
      613.313
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB25",
    "rect": [
      545.25,
      571.4,
      577.228,
      589.401
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB26",
    "rect": [
      493.76,
      547.062,
      576.738,
      565.063
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB27",
    "rect": [
      495.885,
      523.687,
      578.863,
      541.688
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB28",
    "rect": [
      494.76,
      499.812,
      577.738,
      517.813
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "LINE29",
    "rect": [
      495.447,
      475.25,
      578.426,
      493.251
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLASD2",
    "rect": [
      350.118,
      391.81,
      382.096,
      409.811
    ],
    "value": "0302"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA30",
    "rect": [
      313.979,
      367.719,
      396.957,
      385.72
    ],
    "value": "40000"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "L31A_NEG",
    "rect": [
      213.799,
      321.63,
      228.199,
      336.03
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA31",
    "rect": [
      315.417,
      319.195,
      398.395,
      337.196
    ],
    "value": "0"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA32",
    "rect": [
      314.816,
      295.995,
      397.794,
      313.996
    ],
    "value": "40000"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA35",
    "rect": [
      314.616,
      274.395,
      397.594,
      290.396
    ],
    "value": "40000"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA36",
    "rect": [
      314.416,
      250.795,
      397.394,
      266.796
    ],
    "value": "40000"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA37",
    "rect": [
      364.659,
      228.701,
      396.637,
      244.702
    ],
    "value": ".0125"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA38",
    "rect": [
      315.616,
      204.195,
      398.594,
      220.196
    ],
    "value": "500"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA39",
    "rect": [
      316.116,
      180.596,
      399.094,
      196.597
    ],
    "value": "0"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLA40",
    "rect": [
      314.816,
      155.196,
      397.794,
      171.197
    ],
    "value": "500"
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLBSD2",
    "rect": [
      529.492,
      391.81,
      561.471,
      409.811
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB30",
    "rect": [
      494.166,
      367.531,
      577.144,
      385.533
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "L31B_NEG",
    "rect": [
      407.188,
      321.63,
      421.588,
      336.03
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB31",
    "rect": [
      495.604,
      319.007,
      578.582,
      337.009
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB32",
    "rect": [
      495.003,
      295.807,
      577.981,
      313.809
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB35",
    "rect": [
      494.803,
      274.207,
      577.781,
      290.209
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB36",
    "rect": [
      494.603,
      250.607,
      577.581,
      266.609
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB37",
    "rect": [
      544.16,
      228.701,
      576.138,
      244.702
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB38",
    "rect": [
      495.803,
      204.008,
      578.781,
      220.009
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB39",
    "rect": [
      495.303,
      180.408,
      578.281,
      196.409
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "COLB40",
    "rect": [
      495.003,
      155.008,
      577.981,
      171.01
    ],
    "value": ""
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 3,
    "field": "LINE41",
    "rect": [
      495.109,
      130.902,
      578.088,
      146.903
    ],
    "value": "500"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "TP_SSN1",
    "rect": [
      265.009,
      695.196,
      347.303,
      708.08
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "TotalWithholding",
    "rect": [
      466.89,
      609.295,
      527.207,
      622.331
    ],
    "value": "600"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_PS",
    "rect": [
      41.1148,
      551.964,
      53.9528,
      564.88
    ],
    "value": "P"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_SD",
    "rect": [
      60.0,
      551.0,
      95.25,
      564.0
    ],
    "value": "0302"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_EIN",
    "rect": [
      142.952,
      551.031,
      212.91,
      564.068
    ],
    "value": "91-7400302"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_WAGE",
    "rect": [
      285.708,
      551.031,
      355.665,
      564.068
    ],
    "value": "60000"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_FITW",
    "rect": [
      444.34,
      551.031,
      505.737,
      564.068
    ],
    "value": "6000"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_OHID",
    "rect": [
      55.452,
      514.884,
      125.41,
      527.92
    ],
    "value": "12345678"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_OHWAGE",
    "rect": [
      227.52,
      514.884,
      297.478,
      527.92
    ],
    "value": "40000"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_OHIT",
    "rect": [
      429.92,
      514.884,
      491.317,
      527.92
    ],
    "value": "600"
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L2_PS",
    "rect": [
      41.1148,
      479.964,
      53.9528,
      492.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L2_SD",
    "rect": [
      60.0,
      479.5,
      95.25,
      492.5
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L2_EIN",
    "rect": [
      142.952,
      479.844,
      212.91,
      492.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L2_WAGE",
    "rect": [
      285.708,
      479.844,
      355.665,
      492.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L2_FITW",
    "rect": [
      444.34,
      479.844,
      505.737,
      492.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L2_OHID",
    "rect": [
      55.452,
      443.884,
      125.41,
      456.92
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L2_OHWAGE",
    "rect": [
      227.52,
      443.884,
      297.478,
      456.92
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L2_OHIT",
    "rect": [
      429.92,
      443.884,
      491.317,
      456.92
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L3_PS",
    "rect": [
      41.1148,
      409.044,
      53.9528,
      421.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L3_SD",
    "rect": [
      60.0,
      408.0,
      95.25,
      421.0
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L3_EIN",
    "rect": [
      142.952,
      407.924,
      212.91,
      420.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L3_WAGE",
    "rect": [
      285.708,
      407.924,
      355.665,
      420.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L3_FITW",
    "rect": [
      444.34,
      407.924,
      505.737,
      420.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L3_OHID",
    "rect": [
      55.452,
      371.844,
      125.41,
      384.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L3_OHWAGE",
    "rect": [
      227.52,
      371.844,
      297.478,
      384.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L3_OHIT",
    "rect": [
      429.92,
      371.844,
      491.317,
      384.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L4_PS",
    "rect": [
      41.1148,
      337.044,
      53.9528,
      349.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L4_SD",
    "rect": [
      60.0,
      336.5,
      95.25,
      349.5
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L4_EIN",
    "rect": [
      142.952,
      337.579,
      212.91,
      349.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L4_WAGE",
    "rect": [
      285.708,
      336.924,
      355.665,
      349.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L4_FITW",
    "rect": [
      444.34,
      336.924,
      505.737,
      349.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L4_OHID",
    "rect": [
      55.452,
      299.047,
      125.41,
      312.083
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L4_OHWAGE",
    "rect": [
      227.52,
      299.047,
      297.478,
      312.083
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L4_OHIT",
    "rect": [
      429.717,
      299.047,
      491.114,
      312.083
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L5_PS",
    "rect": [
      41.1148,
      265.044,
      53.9528,
      277.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L5_SD",
    "rect": [
      60.0,
      264.0,
      95.25,
      277.0
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L5_EIN",
    "rect": [
      142.952,
      263.924,
      212.91,
      276.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L5_WAGE",
    "rect": [
      285.708,
      263.924,
      355.665,
      276.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L5_FITW",
    "rect": [
      444.34,
      263.924,
      505.737,
      276.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L5_OHID",
    "rect": [
      55.452,
      227.844,
      125.41,
      240.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L5_OHWAGE",
    "rect": [
      227.52,
      227.844,
      297.478,
      240.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L5_OHIT",
    "rect": [
      429.92,
      227.844,
      491.317,
      240.88
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_C_L1_PS",
    "rect": [
      41.1148,
      180.004,
      53.9528,
      192.92
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_C_L1_SD",
    "rect": [
      60.0,
      178.5,
      95.25,
      191.5
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_C_L1_TIN",
    "rect": [
      142.952,
      177.884,
      212.91,
      190.92
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_C_L1_GROSS",
    "rect": [
      284.708,
      177.884,
      354.665,
      190.92
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_C_L1_FITW",
    "rect": [
      444.34,
      177.884,
      505.737,
      190.92
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_C_L1_OHID",
    "rect": [
      55.452,
      142.924,
      125.41,
      155.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_C_L1_SD_DIST",
    "rect": [
      227.52,
      142.924,
      297.478,
      155.96
    ],
    "value": ""
  },
  {
    "file": "oh-sd-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_C_L1_SD_TAX",
    "rect": [
      429.92,
      142.924,
      491.317,
      155.96
    ],
    "value": ""
  }
];
export const schoolPyStatuses:SchoolPyStatus[]=[
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "CHK_AMD",
    "rect": [
      40.677,
      694.028,
      52.761,
      706.403
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "CHK_NOL",
    "rect": [
      314.87,
      694.028,
      326.954,
      706.403
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "CHK_PRIM_DEC",
    "rect": [
      198.75,
      657.615,
      210.834,
      669.99
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "CHK_SP_DEC",
    "rect": [
      415.307,
      657.615,
      427.391,
      669.99
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "FED_EXT",
    "rect": [
      480.539,
      657.615,
      492.623,
      669.99
    ],
    "APOnValues": [
      "/Yes"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "CHK_FILING_STATUS",
    "rect": [
      44.201,
      405.515,
      56.285,
      417.89
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": true
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "CHK_FILING_STATUS",
    "rect": [
      184.867,
      405.515,
      196.951,
      417.89
    ],
    "APOnValues": [
      "/2"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "CHK_FILING_STATUS",
    "rect": [
      292.856,
      405.515,
      304.94,
      417.89
    ],
    "APOnValues": [
      "/3"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "PRIMARY_CHK0",
    "rect": [
      472.749,
      324.419,
      484.608,
      336.793
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": true
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SPOUSE_CHK0",
    "rect": [
      523.276,
      324.419,
      535.135,
      336.793
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "PRIMARY_CHK1",
    "rect": [
      473.303,
      288.326,
      485.162,
      300.7
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": true
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SPOUSE_CHK1",
    "rect": [
      523.83,
      288.326,
      535.689,
      300.7
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "PRIMARY_CHK2",
    "rect": [
      473.303,
      252.782,
      485.162,
      265.156
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SPOUSE_CHK2",
    "rect": [
      523.83,
      252.782,
      535.689,
      265.156
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "PRIMARY_CHK3",
    "rect": [
      473.303,
      215.768,
      485.162,
      228.142
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SPOUSE_CHK3",
    "rect": [
      523.83,
      215.768,
      535.689,
      228.142
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "PRIMARY_CHK4",
    "rect": [
      473.303,
      180.753,
      485.162,
      193.127
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SPOUSE_CHK4",
    "rect": [
      523.83,
      180.753,
      535.689,
      193.127
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "PRIMARY_CHK5",
    "rect": [
      473.303,
      144.739,
      485.162,
      157.113
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 1,
    "field": "SPOUSE_CHK5",
    "rect": [
      523.83,
      144.739,
      535.689,
      157.113
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "CHK_AUTH",
    "rect": [
      56.189,
      42.907,
      67.199,
      60.907
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  },
  {
    "file": "oh-sd-100-review.pdf",
    "page": 2,
    "field": "CHK_NPP",
    "rect": [
      171.494,
      42.907,
      182.504,
      60.907
    ],
    "APOnValues": [
      "/1"
    ],
    "selected": false
  }
];
export function schoolPyPaperCells(c:SchoolPyPaperCase):SchoolPyCell[]{
 const change:Record<string,string>=c.name==='covered'?{L11:'500',L14:'500',L16:'500',L17:'0',L18:'0',L19:'0',L20:'0',L22:'0',TotalWithholding:'500',SchedW_B_L1_OHIT:'500'}:{};
 return sourceTextCells.map(cell=>({...cell,value:change[cell.field]??cell.value}));
}
