/** Independent literal original/source/physical cells, frozen before candidate outputs. */
import {reciprocalOhioWageFixture,explicitlyReplaceReciprocalW2,reciprocalW2} from './oh-reciprocal-wage-sources.js';
export const reciprocalPhysicalFiles = {'oh-it-1040-review.pdf':2,'oh-it-nrc-review.pdf':1,'oh-schedule-credits-review.pdf':2,'oh-schedule-of-withholding-review.pdf':2,'oh-schedule-adjustments-review.pdf':2} as const;
export interface ReciprocalPhysicalCell {file:string;page:number;field:string;rect:number[];value:string}
export interface ReciprocalPaperCase {name:string;rawWages:string;rawOhioWithholding:string;rawPennsylvaniaWithholding:string;ohioFirst:boolean;reportedWages:string;reportedOhioWithholding:string;lastPayrollWages:string;lastPayrollOhioWithholding:string;physicalFiles:Record<string,number>;expectedPhysicalPageCount:number;expectedPhysicalCellCount:number;physicalCells:ReciprocalPhysicalCell[]}
export const reciprocalPaperCases:ReciprocalPaperCase[] = [
  {
    "name": "refund",
    "rawWages": "60000.25",
    "rawOhioWithholding": "2000.60",
    "rawPennsylvaniaWithholding": "1842.01",
    "ohioFirst": false,
    "reportedWages": "60000",
    "reportedOhioWithholding": "2001",
    "lastPayrollWages": "5000.03",
    "lastPayrollOhioWithholding": "166.68",
    "physicalFiles": {
      "oh-it-1040-review.pdf": 2,
      "oh-it-nrc-review.pdf": 1,
      "oh-schedule-credits-review.pdf": 2,
      "oh-schedule-of-withholding-review.pdf": 2,
      "oh-schedule-adjustments-review.pdf": 2
    },
    "expectedPhysicalPageCount": 9,
    "expectedPhysicalCellCount": 168,
    "physicalCells": [
      {
        "file": "oh-it-1040-review.pdf",
        "page": 1,
        "field": "L1",
        "rect": [
          488.486,
          263.036,
          570.864,
          276.357
        ],
        "value": "60000"
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
        ],
        "value": "0"
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
        ],
        "value": "60000"
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
        ],
        "value": "0"
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
        ],
        "value": "2400"
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
        ],
        "value": "1"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "9999"
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
        ],
        "value": "PA"
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
        ],
        "value": ""
      },
      {
        "file": "oh-it-1040-review.pdf",
        "page": 1,
        "field": "TP_SSN",
        "rect": [
          39.751,
          656.833,
          123.298,
          670.154
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "20"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "2001"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "2001"
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
        ],
        "value": ""
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
        ],
        "value": "2001"
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": "2001"
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
        ],
        "value": "0"
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
        ],
        "value": "2001"
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "60000"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "60000"
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": "60000"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": ".0000"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "20"
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
        ],
        "value": "20"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "20"
      },
      {
        "file": "oh-schedule-of-withholding-review.pdf",
        "page": 1,
        "field": "SchedW_A",
        "rect": [
          432.542,
          624.172,
          508.24,
          636.881
        ],
        "value": "2001"
      },
      {
        "file": "oh-schedule-of-withholding-review.pdf",
        "page": 1,
        "field": "SchedW_B_L1_PS",
        "rect": [
          41.975,
          574.746,
          53.803,
          587.662
        ],
        "value": "P"
      },
      {
        "file": "oh-schedule-of-withholding-review.pdf",
        "page": 1,
        "field": "SchedW_B_L1_WAGE",
        "rect": [
          228.114,
          575.353,
          297.76,
          587.353
        ],
        "value": "60000"
      },
      {
        "file": "oh-schedule-of-withholding-review.pdf",
        "page": 1,
        "field": "SchedW_B_L1_FITW",
        "rect": [
          401.434,
          575.353,
          464.534,
          587.353
        ],
        "value": "0"
      },
      {
        "file": "oh-schedule-of-withholding-review.pdf",
        "page": 1,
        "field": "SchedW_B_L1_OHWAGE",
        "rect": [
          228.114,
          539.393,
          297.76,
          551.393
        ],
        "value": "60000"
      },
      {
        "file": "oh-schedule-of-withholding-review.pdf",
        "page": 1,
        "field": "SchedW_B_L1_OHIT",
        "rect": [
          429.514,
          539.393,
          491.864,
          551.393
        ],
        "value": "2001"
      },
      {
        "file": "oh-schedule-of-withholding-review.pdf",
        "page": 1,
        "field": "SchedW_B_L1_EIN",
        "rect": [
          62.452,
          575.353,
          130.223,
          587.353
        ],
        "value": ""
      },
      {
        "file": "oh-schedule-of-withholding-review.pdf",
        "page": 1,
        "field": "SchedW_B_L1_OHID",
        "rect": [
          62.452,
          539.393,
          127.005,
          551.393
        ],
        "value": ""
      }
    ]
  },
  {
    "name": "known-zero",
    "rawWages": "60000.50",
    "rawOhioWithholding": "0.00",
    "rawPennsylvaniaWithholding": "1842.02",
    "ohioFirst": true,
    "reportedWages": "60001",
    "reportedOhioWithholding": "0",
    "lastPayrollWages": "5000.28",
    "lastPayrollOhioWithholding": "0.00",
    "physicalFiles": {
      "oh-it-1040-review.pdf": 2,
      "oh-it-nrc-review.pdf": 1,
      "oh-schedule-credits-review.pdf": 2,
      "oh-schedule-adjustments-review.pdf": 2
    },
    "expectedPhysicalPageCount": 7,
    "expectedPhysicalCellCount": 160,
    "physicalCells": [
      {
        "file": "oh-it-1040-review.pdf",
        "page": 1,
        "field": "L1",
        "rect": [
          488.486,
          263.036,
          570.864,
          276.357
        ],
        "value": "60001"
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
        ],
        "value": "0"
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
        ],
        "value": "60001"
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
        ],
        "value": "0"
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
        ],
        "value": "2400"
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
        ],
        "value": "1"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "9999"
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
        ],
        "value": "PA"
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
        ],
        "value": ""
      },
      {
        "file": "oh-it-1040-review.pdf",
        "page": 1,
        "field": "TP_SSN",
        "rect": [
          39.751,
          656.833,
          123.298,
          670.154
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "20"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": ""
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "60001"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "60001"
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
        ],
        "value": ""
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
        ],
        "value": ""
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
        ],
        "value": "60001"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": ".0000"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "20"
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
        ],
        "value": "20"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "0"
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
        ],
        "value": "20"
      }
    ]
  }
];
/** Separately supplied PA printed cash is retained, not an Ohio source. Captures are fixture authoring only. */
export function reciprocalOfficialReviewFixture(c:ReciprocalPaperCase) {
 const p=reciprocalOhioWageFixture(c.rawWages,c.rawOhioWithholding,c.ohioFirst),w=reciprocalW2(p);
 if(!w.stateLocalSources)throw new Error('Actual two-state W2 original required');
 const pa=w.stateLocalSources.stateRows.find(row=>row.state==='PA');
 if(!pa)throw new Error('Actual PA printed row required');
 pa.withheld=c.rawPennsylvaniaWithholding;
 if(!c.ohioFirst)w.stateTaxWithheld=c.rawPennsylvaniaWithholding;
 explicitlyReplaceReciprocalW2(p);
 return p;
}
export function reciprocalPaperRequired<T>(value:T|null|undefined):T {if(value===null||value===undefined)throw new Error('Independent actual paper source missing');return value;}

/** Fictional independently supplied positive-cent payroll originals, authored before product. */
export function reciprocalPositiveCentWithholdingFixture(){
 const c=reciprocalPaperRequired(reciprocalPaperCases.find(row=>row.name==='known-zero'));
 const p=reciprocalOfficialReviewFixture(c),w=reciprocalW2(p),sources=reciprocalPaperRequired(w.stateLocalSources);
 const ohio=reciprocalPaperRequired(sources.stateRows.find(row=>row.state==='OH'));
 ohio.withheld='0.49';w.stateTaxWithheld='0.49';
 for(const[index,row]of p.facts.reciprocalWageSources.payrollRows.entries())row.ohioWithheld=index===11?'0.49':'0.00';
 // Fixture authoring reissues actual source originals and parent captures explicitly.
 explicitlyReplaceReciprocalW2(p);
 return p;
}
export const reciprocalPositiveCentWithholdingCells:ReciprocalPhysicalCell[] = [
  {
    "file": "oh-schedule-of-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_A",
    "rect": [
      432.542,
      624.172,
      508.24,
      636.881
    ],
    "value": "0"
  },
  {
    "file": "oh-schedule-of-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_PS",
    "rect": [
      41.975,
      574.746,
      53.803,
      587.662
    ],
    "value": "P"
  },
  {
    "file": "oh-schedule-of-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_WAGE",
    "rect": [
      228.114,
      575.353,
      297.76,
      587.353
    ],
    "value": "60001"
  },
  {
    "file": "oh-schedule-of-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_FITW",
    "rect": [
      401.434,
      575.353,
      464.534,
      587.353
    ],
    "value": "0"
  },
  {
    "file": "oh-schedule-of-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_OHWAGE",
    "rect": [
      228.114,
      539.393,
      297.76,
      551.393
    ],
    "value": "60001"
  },
  {
    "file": "oh-schedule-of-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_OHIT",
    "rect": [
      429.514,
      539.393,
      491.864,
      551.393
    ],
    "value": "0"
  },
  {
    "file": "oh-schedule-of-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_EIN",
    "rect": [
      62.452,
      575.353,
      130.223,
      587.353
    ],
    "value": ""
  },
  {
    "file": "oh-schedule-of-withholding-review.pdf",
    "page": 1,
    "field": "SchedW_B_L1_OHID",
    "rect": [
      62.452,
      539.393,
      127.005,
      551.393
    ],
    "value": ""
  }
];
