/**
 * Ohio school district metadata lookup for SD 100 inputs.
 * Spec: spec/state/oh-school-district-lookup.yaml
 * Official source: Ohio Department of Taxation The Finder SD rate database table.
 */

import Decimal from "decimal.js";
import { OHIO_SCHOOL_DISTRICT_NAMES } from "@/engine/state/oh-school-district-name-index.js";

export type OhioSchoolDistrictTaxType = "traditional" | "earned_income";

interface OhioSchoolDistrictRatePeriod {
  startDate: number;
  endDate: number;
  districtNumber: string;
  taxType: OhioSchoolDistrictTaxType;
  rate: string;
}

export interface OhioSchoolDistrictMetadata {
  districtNumber: string;
  taxType: OhioSchoolDistrictTaxType;
  rate: Decimal;
}

const OHIO_SCHOOL_DISTRICT_RATE_PERIODS: OhioSchoolDistrictRatePeriod[] = [
  { startDate: 20230101, endDate: 20251231, districtNumber: "0203", taxType: "traditional", rate: ".0050" },
  { startDate: 20210101, endDate: 20251231, districtNumber: "0204", taxType: "traditional", rate: ".0050" },
  { startDate: 19930101, endDate: 20271231, districtNumber: "0209", taxType: "traditional", rate: ".0100" },
  { startDate: 20140101, endDate: 20331231, districtNumber: "0302", taxType: "earned_income", rate: ".0125" },
  { startDate: 20000101, endDate: 21001231, districtNumber: "0303", taxType: "traditional", rate: ".0125" },
  { startDate: 20190101, endDate: 20281231, districtNumber: "0404", taxType: "earned_income", rate: ".0125" },
  { startDate: 20200101, endDate: 20241231, districtNumber: "0501", taxType: "earned_income", rate: ".0100" },
  { startDate: 20150101, endDate: 20281231, districtNumber: "0502", taxType: "earned_income", rate: ".0100" },
  { startDate: 20120101, endDate: 20311231, districtNumber: "0601", taxType: "traditional", rate: ".0100" },
  { startDate: 20150101, endDate: 21001231, districtNumber: "0602", taxType: "traditional", rate: ".0100" },
  { startDate: 20150101, endDate: 20291231, districtNumber: "0603", taxType: "traditional", rate: ".0125" },
  { startDate: 20240101, endDate: 20281231, districtNumber: "0604", taxType: "earned_income", rate: ".0100" },
  { startDate: 19960101, endDate: 21001231, districtNumber: "0605", taxType: "traditional", rate: ".0075" },
  { startDate: 20020101, endDate: 20261231, districtNumber: "0606", taxType: "traditional", rate: ".0100" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "0905", taxType: "traditional", rate: ".0050" },
  { startDate: 19900101, endDate: 21001231, districtNumber: "0907", taxType: "traditional", rate: ".0100" },
  { startDate: 20200101, endDate: 21001231, districtNumber: "0908", taxType: "earned_income", rate: ".0125" },
  { startDate: 20050101, endDate: 21001231, districtNumber: "0909", taxType: "traditional", rate: ".0100" },
  { startDate: 20070101, endDate: 20261231, districtNumber: "1102", taxType: "traditional", rate: ".0150" },
  { startDate: 20160101, endDate: 20251231, districtNumber: "1103", taxType: "traditional", rate: ".0150" },
  { startDate: 20230101, endDate: 20271231, districtNumber: "1105", taxType: "traditional", rate: ".0175" },
  { startDate: 20160101, endDate: 20251231, districtNumber: "1203", taxType: "earned_income", rate: ".0100" },
  { startDate: 20100101, endDate: 21001231, districtNumber: "1204", taxType: "earned_income", rate: ".0100" },
  { startDate: 19900101, endDate: 21001231, districtNumber: "1205", taxType: "traditional", rate: ".0100" },
  { startDate: 19960101, endDate: 21001231, districtNumber: "1303", taxType: "traditional", rate: ".0100" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "1305", taxType: "traditional", rate: ".0100" },
  { startDate: 20240101, endDate: 20281231, districtNumber: "1401", taxType: "earned_income", rate: ".0100" },
  { startDate: 20200101, endDate: 20241231, districtNumber: "1402", taxType: "earned_income", rate: ".0050" },
  { startDate: 20030101, endDate: 21001231, districtNumber: "1502", taxType: "traditional", rate: ".0100" },
  { startDate: 19900101, endDate: 21001231, districtNumber: "1503", taxType: "traditional", rate: ".0100" },
  { startDate: 20210101, endDate: 20251231, districtNumber: "1505", taxType: "earned_income", rate: ".0050" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "1510", taxType: "traditional", rate: ".0050" },
  { startDate: 19900101, endDate: 21001231, districtNumber: "1701", taxType: "traditional", rate: ".0150" },
  { startDate: 20080101, endDate: 21001231, districtNumber: "1703", taxType: "traditional", rate: ".0125" },
  { startDate: 20100101, endDate: 21001231, districtNumber: "1704", taxType: "earned_income", rate: ".0025" },
  { startDate: 20110101, endDate: 20251231, districtNumber: "1901", taxType: "traditional", rate: ".0175" },
  { startDate: 20070101, endDate: 20251231, districtNumber: "1902", taxType: "traditional", rate: ".0150" },
  { startDate: 19930101, endDate: 21001231, districtNumber: "1903", taxType: "traditional", rate: ".0075" },
  { startDate: 19900101, endDate: 21001231, districtNumber: "1904", taxType: "traditional", rate: ".0050" },
  { startDate: 20070101, endDate: 20261231, districtNumber: "1905", taxType: "traditional", rate: ".0175" },
  { startDate: 20000101, endDate: 21001231, districtNumber: "1906", taxType: "traditional", rate: ".0150" },
  { startDate: 20130101, endDate: 20281231, districtNumber: "1907", taxType: "traditional", rate: ".0100" },
  { startDate: 20230101, endDate: 20271231, districtNumber: "2001", taxType: "traditional", rate: ".0100" },
  { startDate: 20200101, endDate: 20291231, districtNumber: "2002", taxType: "traditional", rate: ".0125" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "2003", taxType: "traditional", rate: ".0050" },
  { startDate: 20200101, endDate: 20291231, districtNumber: "2004", taxType: "traditional", rate: ".0150" },
  { startDate: 20000101, endDate: 21001231, districtNumber: "2101", taxType: "traditional", rate: ".0075" },
  { startDate: 19930101, endDate: 21001231, districtNumber: "2102", taxType: "traditional", rate: ".0100" },
  { startDate: 20200101, endDate: 20341231, districtNumber: "2301", taxType: "earned_income", rate: ".0200" },
  { startDate: 20150101, endDate: 21001231, districtNumber: "2302", taxType: "earned_income", rate: ".0200" },
  { startDate: 20060101, endDate: 21001231, districtNumber: "2303", taxType: "traditional", rate: ".0125" },
  { startDate: 20070101, endDate: 20361231, districtNumber: "2304", taxType: "traditional", rate: ".0200" },
  { startDate: 20170101, endDate: 21001231, districtNumber: "2305", taxType: "earned_income", rate: ".0150" },
  { startDate: 20160101, endDate: 21001231, districtNumber: "2306", taxType: "traditional", rate: ".0175" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "2307", taxType: "traditional", rate: ".0100" },
  { startDate: 20140101, endDate: 20331231, districtNumber: "2308", taxType: "earned_income", rate: ".0175" },
  { startDate: 20210101, endDate: 20271231, districtNumber: "2402", taxType: "earned_income", rate: ".0100" },
  { startDate: 20050101, endDate: 21001231, districtNumber: "2501", taxType: "traditional", rate: ".0075" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "2502", taxType: "traditional", rate: ".0075" },
  { startDate: 19900101, endDate: 21001231, districtNumber: "2509", taxType: "traditional", rate: ".0050" },
  { startDate: 20230101, endDate: 20271231, districtNumber: "2602", taxType: "traditional", rate: ".0150" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "2603", taxType: "traditional", rate: ".0100" },
  { startDate: 20040101, endDate: 21001231, districtNumber: "2604", taxType: "traditional", rate: ".0100" },
  { startDate: 20220101, endDate: 20261231, districtNumber: "2605", taxType: "traditional", rate: ".0100" },
  { startDate: 20200101, endDate: 20291231, districtNumber: "2606", taxType: "traditional", rate: ".0075" },
  { startDate: 20230101, endDate: 20271231, districtNumber: "2607", taxType: "earned_income", rate: ".0175" },
  { startDate: 20080101, endDate: 21001231, districtNumber: "2801", taxType: "earned_income", rate: ".0100" },
  { startDate: 20100101, endDate: 20381231, districtNumber: "2902", taxType: "traditional", rate: ".0125" },
  { startDate: 19900101, endDate: 21001231, districtNumber: "2903", taxType: "traditional", rate: ".0050" },
  { startDate: 20020101, endDate: 21001231, districtNumber: "2904", taxType: "traditional", rate: ".0100" },
  { startDate: 20020101, endDate: 20301231, districtNumber: "2906", taxType: "traditional", rate: ".0050" },
  { startDate: 20240101, endDate: 21001231, districtNumber: "2907", taxType: "traditional", rate: ".0200" },
  { startDate: 20070101, endDate: 21001231, districtNumber: "3118", taxType: "earned_income", rate: ".0075" },
  { startDate: 19950101, endDate: 21001231, districtNumber: "3122", taxType: "traditional", rate: ".0125" },
  { startDate: 20150101, endDate: 20291231, districtNumber: "3201", taxType: "traditional", rate: ".0100" },
  { startDate: 20230101, endDate: 21001231, districtNumber: "3202", taxType: "traditional", rate: ".0175" },
  { startDate: 20040101, endDate: 20281231, districtNumber: "3203", taxType: "traditional", rate: ".0175" },
  { startDate: 19950101, endDate: 20301231, districtNumber: "3205", taxType: "traditional", rate: ".0075" },
  { startDate: 20200101, endDate: 21001231, districtNumber: "3206", taxType: "traditional", rate: ".0150" },
  { startDate: 20210101, endDate: 20301231, districtNumber: "3207", taxType: "traditional", rate: ".0100" },
  { startDate: 20060101, endDate: 21001231, districtNumber: "3208", taxType: "traditional", rate: ".0100" },
  { startDate: 20140101, endDate: 20271231, districtNumber: "3301", taxType: "traditional", rate: ".0150" },
  { startDate: 20060101, endDate: 21001231, districtNumber: "3302", taxType: "traditional", rate: ".0175" },
  { startDate: 20160101, endDate: 21001231, districtNumber: "3303", taxType: "traditional", rate: ".0100" },
  { startDate: 20110101, endDate: 20251231, districtNumber: "3304", taxType: "traditional", rate: ".0175" },
  { startDate: 20000101, endDate: 20261231, districtNumber: "3305", taxType: "traditional", rate: ".0100" },
  { startDate: 19960101, endDate: 21001231, districtNumber: "3306", taxType: "traditional", rate: ".0050" },
  { startDate: 20050101, endDate: 21001231, districtNumber: "3501", taxType: "traditional", rate: ".0150" },
  { startDate: 20070101, endDate: 21001231, districtNumber: "3502", taxType: "traditional", rate: ".0175" },
  { startDate: 19980101, endDate: 21001231, districtNumber: "3504", taxType: "traditional", rate: ".0175" },
  { startDate: 20040101, endDate: 21001231, districtNumber: "3603", taxType: "earned_income", rate: ".0125" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "3604", taxType: "traditional", rate: ".0100" },
  { startDate: 20020101, endDate: 20261231, districtNumber: "3901", taxType: "traditional", rate: ".0050" },
  { startDate: 20100101, endDate: 21001231, districtNumber: "3902", taxType: "earned_income", rate: ".0150" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "3903", taxType: "traditional", rate: ".0100" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "3904", taxType: "traditional", rate: ".0050" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "3905", taxType: "traditional", rate: ".0125" },
  { startDate: 19970101, endDate: 21001231, districtNumber: "3906", taxType: "traditional", rate: ".0125" },
  { startDate: 20120101, endDate: 21001231, districtNumber: "3907", taxType: "earned_income", rate: ".0075" },
  { startDate: 19980101, endDate: 21001231, districtNumber: "4201", taxType: "traditional", rate: ".0075" },
  { startDate: 20160101, endDate: 20241231, districtNumber: "4202", taxType: "traditional", rate: ".0150" },
  { startDate: 20250101, endDate: 20341231, districtNumber: "4202", taxType: "traditional", rate: ".0175" },
  { startDate: 20190101, endDate: 20281231, districtNumber: "4501", taxType: "traditional", rate: ".0075" },
  { startDate: 20040101, endDate: 20281231, districtNumber: "4503", taxType: "traditional", rate: ".0100" },
  { startDate: 19940101, endDate: 21001231, districtNumber: "4506", taxType: "traditional", rate: ".0100" },
  { startDate: 20230101, endDate: 21001231, districtNumber: "4507", taxType: "traditional", rate: ".0100" },
  { startDate: 20080101, endDate: 20281231, districtNumber: "4508", taxType: "earned_income", rate: ".0100" },
  { startDate: 20200101, endDate: 20461231, districtNumber: "4509", taxType: "traditional", rate: ".0050" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "4510", taxType: "traditional", rate: ".0075" },
  { startDate: 20200101, endDate: 21001231, districtNumber: "4604", taxType: "traditional", rate: ".0150" },
  { startDate: 20080101, endDate: 20271231, districtNumber: "4712", taxType: "traditional", rate: ".0200" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "4715", taxType: "traditional", rate: ".0100" },
  { startDate: 20150101, endDate: 20261231, districtNumber: "4901", taxType: "earned_income", rate: ".0100" },
  { startDate: 20150101, endDate: 20261231, districtNumber: "4902", taxType: "earned_income", rate: ".0125" },
  { startDate: 20060101, endDate: 21001231, districtNumber: "4903", taxType: "traditional", rate: ".0100" },
  { startDate: 20190101, endDate: 20331231, districtNumber: "4904", taxType: "earned_income", rate: ".0125" },
  { startDate: 20070101, endDate: 20261231, districtNumber: "5008", taxType: "earned_income", rate: ".0100" },
  { startDate: 20000101, endDate: 20291231, districtNumber: "5010", taxType: "traditional", rate: ".0100" },
  { startDate: 20100101, endDate: 21001231, districtNumber: "5101", taxType: "earned_income", rate: ".0075" },
  { startDate: 20200101, endDate: 20291231, districtNumber: "5103", taxType: "earned_income", rate: ".0100" },
  { startDate: 20210101, endDate: 21001231, districtNumber: "5104", taxType: "earned_income", rate: ".0100" },
  { startDate: 20200101, endDate: 20291231, districtNumber: "5105", taxType: "earned_income", rate: ".0100" },
  { startDate: 20230101, endDate: 20341231, districtNumber: "5204", taxType: "earned_income", rate: ".0100" },
  { startDate: 20190101, endDate: 20281231, districtNumber: "5401", taxType: "earned_income", rate: ".0100" },
  { startDate: 19900101, endDate: 20251231, districtNumber: "5402", taxType: "traditional", rate: ".0050" },
  { startDate: 20240101, endDate: 20531231, districtNumber: "5403", taxType: "earned_income", rate: ".0050" },
  { startDate: 20010101, endDate: 20251231, districtNumber: "5405", taxType: "traditional", rate: ".0100" },
  { startDate: 20060101, endDate: 21001231, districtNumber: "5406", taxType: "traditional", rate: ".0150" },
  { startDate: 20110101, endDate: 20251231, districtNumber: "5501", taxType: "earned_income", rate: ".0075" },
  { startDate: 19930101, endDate: 21001231, districtNumber: "5502", taxType: "traditional", rate: ".0175" },
  { startDate: 20140101, endDate: 20251231, districtNumber: "5503", taxType: "traditional", rate: ".0200" },
  { startDate: 20120101, endDate: 21001231, districtNumber: "5504", taxType: "earned_income", rate: ".0175" },
  { startDate: 20090101, endDate: 20251231, districtNumber: "5505", taxType: "earned_income", rate: ".0125" },
  { startDate: 20050101, endDate: 20251231, districtNumber: "5506", taxType: "traditional", rate: ".0175" },
  { startDate: 20090101, endDate: 21001231, districtNumber: "5507", taxType: "traditional", rate: ".0125" },
  { startDate: 20070101, endDate: 21001231, districtNumber: "5509", taxType: "earned_income", rate: ".0150" },
  { startDate: 20070101, endDate: 20251231, districtNumber: "5708", taxType: "traditional", rate: ".0125" },
  { startDate: 20210101, endDate: 21001231, districtNumber: "5713", taxType: "traditional", rate: ".0175" },
  { startDate: 20240101, endDate: 20281231, districtNumber: "5901", taxType: "earned_income", rate: ".0075" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "5902", taxType: "traditional", rate: ".0050" },
  { startDate: 20200101, endDate: 20241231, districtNumber: "5903", taxType: "traditional", rate: ".0150" },
  { startDate: 20250101, endDate: 21001231, districtNumber: "5903", taxType: "traditional", rate: ".0075" },
  { startDate: 19930101, endDate: 21001231, districtNumber: "5904", taxType: "traditional", rate: ".0100" },
  { startDate: 20060101, endDate: 20301231, districtNumber: "6301", taxType: "traditional", rate: ".0150" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "6302", taxType: "traditional", rate: ".0100" },
  { startDate: 20050101, endDate: 20261231, districtNumber: "6303", taxType: "traditional", rate: ".0125" },
  { startDate: 20060101, endDate: 21001231, districtNumber: "6501", taxType: "earned_income", rate: ".0075" },
  { startDate: 20060101, endDate: 20251231, districtNumber: "6502", taxType: "earned_income", rate: ".0100" },
  { startDate: 20130101, endDate: 21001231, districtNumber: "6503", taxType: "earned_income", rate: ".0150" },
  { startDate: 20190101, endDate: 20281231, districtNumber: "6704", taxType: "earned_income", rate: ".0150" },
  { startDate: 20060101, endDate: 20251231, districtNumber: "6802", taxType: "traditional", rate: ".0175" },
  { startDate: 20060101, endDate: 20251231, districtNumber: "6803", taxType: "traditional", rate: ".0150" },
  { startDate: 20220101, endDate: 20261231, districtNumber: "6804", taxType: "traditional", rate: ".0175" },
  { startDate: 20140101, endDate: 20271231, districtNumber: "6805", taxType: "traditional", rate: ".0150" },
  { startDate: 20150101, endDate: 20291231, districtNumber: "6806", taxType: "earned_income", rate: ".0100" },
  { startDate: 20100101, endDate: 20251231, districtNumber: "6901", taxType: "traditional", rate: ".0100" },
  { startDate: 20110101, endDate: 21001231, districtNumber: "6902", taxType: "traditional", rate: ".0100" },
  { startDate: 20060101, endDate: 20301231, districtNumber: "6903", taxType: "traditional", rate: ".0075" },
  { startDate: 20060101, endDate: 21001231, districtNumber: "6904", taxType: "traditional", rate: ".0100" },
  { startDate: 19970101, endDate: 21001231, districtNumber: "6905", taxType: "traditional", rate: ".0075" },
  { startDate: 19930101, endDate: 21001231, districtNumber: "6906", taxType: "traditional", rate: ".0125" },
  { startDate: 20190101, endDate: 21001231, districtNumber: "6907", taxType: "traditional", rate: ".0150" },
  { startDate: 20100101, endDate: 21001231, districtNumber: "6908", taxType: "traditional", rate: ".0075" },
  { startDate: 20240101, endDate: 20261231, districtNumber: "6909", taxType: "traditional", rate: ".0175" },
  { startDate: 20180101, endDate: 20371231, districtNumber: "7001", taxType: "earned_income", rate: ".0100" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "7007", taxType: "traditional", rate: ".0100" },
  { startDate: 20060101, endDate: 21001231, districtNumber: "7008", taxType: "traditional", rate: ".0100" },
  { startDate: 19920101, endDate: 20291231, districtNumber: "7106", taxType: "traditional", rate: ".0050" },
  { startDate: 20160101, endDate: 20251231, districtNumber: "7107", taxType: "earned_income", rate: ".0075" },
  { startDate: 20210101, endDate: 20301231, districtNumber: "7201", taxType: "earned_income", rate: ".0150" },
  { startDate: 20240101, endDate: 20281231, districtNumber: "7202", taxType: "traditional", rate: ".0125" },
  { startDate: 20240101, endDate: 20281231, districtNumber: "7203", taxType: "earned_income", rate: ".0100" },
  { startDate: 20080101, endDate: 21001231, districtNumber: "7204", taxType: "traditional", rate: ".0150" },
  { startDate: 20110101, endDate: 20481231, districtNumber: "7403", taxType: "earned_income", rate: ".0050" },
  { startDate: 20070101, endDate: 20261231, districtNumber: "7404", taxType: "traditional", rate: ".0150" },
  { startDate: 20050101, endDate: 21001231, districtNumber: "7405", taxType: "traditional", rate: ".0100" },
  { startDate: 20010101, endDate: 20301231, districtNumber: "7406", taxType: "traditional", rate: ".0100" },
  { startDate: 20170101, endDate: 21001231, districtNumber: "7501", taxType: "traditional", rate: ".0150" },
  { startDate: 20090101, endDate: 21001231, districtNumber: "7502", taxType: "earned_income", rate: ".0125" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "7503", taxType: "traditional", rate: ".0075" },
  { startDate: 20060101, endDate: 20291231, districtNumber: "7504", taxType: "traditional", rate: ".0150" },
  { startDate: 19970101, endDate: 21001231, districtNumber: "7505", taxType: "traditional", rate: ".0075" },
  { startDate: 20140101, endDate: 21001231, districtNumber: "7506", taxType: "earned_income", rate: ".0150" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "7507", taxType: "traditional", rate: ".0075" },
  { startDate: 20220101, endDate: 20311231, districtNumber: "7508", taxType: "earned_income", rate: ".0075" },
  { startDate: 20110101, endDate: 20321231, districtNumber: "7612", taxType: "earned_income", rate: ".0100" },
  { startDate: 20190101, endDate: 21001231, districtNumber: "7711", taxType: "earned_income", rate: ".0050" },
  { startDate: 20070101, endDate: 20261231, districtNumber: "8001", taxType: "traditional", rate: ".0100" },
  { startDate: 19910101, endDate: 21001231, districtNumber: "8003", taxType: "traditional", rate: ".0100" },
  { startDate: 20050101, endDate: 21001231, districtNumber: "8101", taxType: "traditional", rate: ".0100" },
  { startDate: 20040101, endDate: 21001231, districtNumber: "8104", taxType: "traditional", rate: ".0100" },
  { startDate: 20040101, endDate: 21001231, districtNumber: "8301", taxType: "traditional", rate: ".0100" },
  { startDate: 20230101, endDate: 20271231, districtNumber: "8501", taxType: "earned_income", rate: ".0100" },
  { startDate: 20050101, endDate: 21001231, districtNumber: "8502", taxType: "traditional", rate: ".0075" },
  { startDate: 20190101, endDate: 20281231, districtNumber: "8503", taxType: "earned_income", rate: ".0050" },
  { startDate: 20140101, endDate: 20281231, districtNumber: "8504", taxType: "earned_income", rate: ".0075" },
  { startDate: 19900101, endDate: 21001231, districtNumber: "8505", taxType: "traditional", rate: ".0125" },
  { startDate: 20210101, endDate: 20451231, districtNumber: "8509", taxType: "earned_income", rate: ".0100" },
  { startDate: 20070101, endDate: 21001231, districtNumber: "8601", taxType: "traditional", rate: ".0100" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "8602", taxType: "traditional", rate: ".0100" },
  { startDate: 20160101, endDate: 20251231, districtNumber: "8603", taxType: "earned_income", rate: ".0100" },
  { startDate: 20050101, endDate: 21001231, districtNumber: "8604", taxType: "traditional", rate: ".0100" },
  { startDate: 20130101, endDate: 21001231, districtNumber: "8605", taxType: "earned_income", rate: ".0125" },
  { startDate: 20070101, endDate: 20311231, districtNumber: "8607", taxType: "traditional", rate: ".0150" },
  { startDate: 19980101, endDate: 20251231, districtNumber: "8701", taxType: "traditional", rate: ".0050" },
  { startDate: 20070101, endDate: 20261231, districtNumber: "8702", taxType: "earned_income", rate: ".0100" },
  { startDate: 20160101, endDate: 20301231, districtNumber: "8703", taxType: "traditional", rate: ".0125" },
  { startDate: 20100101, endDate: 20271231, districtNumber: "8705", taxType: "earned_income", rate: ".0125" },
  { startDate: 20150101, endDate: 21001231, districtNumber: "8706", taxType: "earned_income", rate: ".0025" },
  { startDate: 20030101, endDate: 21001231, districtNumber: "8707", taxType: "traditional", rate: ".0100" },
  { startDate: 19920101, endDate: 21001231, districtNumber: "8708", taxType: "traditional", rate: ".0050" },
  { startDate: 20050101, endDate: 20291231, districtNumber: "8801", taxType: "traditional", rate: ".0100" },
  { startDate: 20160101, endDate: 20301231, districtNumber: "8802", taxType: "traditional", rate: ".0100" },
  { startDate: 20060101, endDate: 20291231, districtNumber: "8803", taxType: "traditional", rate: ".0125" },
];

const OHIO_SCHOOL_DISTRICT_NAME_TO_NUMBERS = new Map<string, string[]>();
// Abbreviated name map: keys have district-type suffixes (CSD, LSD, EVSD) stripped.
// Used as a fallback when the full normalized name does not match.
const OHIO_SCHOOL_DISTRICT_ABBREVIATED_NAME_TO_NUMBERS = new Map<string, string[]>();

function abbreviateNormalizedDistrictName(normalizedName: string): string {
  return normalizedName
    .replace(/\bCSD\b/g, "")
    .replace(/\bLSD\b/g, "")
    .replace(/\bEVSD\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

for (const [districtNumber, districtName] of Object.entries(OHIO_SCHOOL_DISTRICT_NAMES)) {
  const normalizedDistrictName = normalizeOhioSchoolDistrictName(districtName);
  const existingDistrictNumbers =
    OHIO_SCHOOL_DISTRICT_NAME_TO_NUMBERS.get(normalizedDistrictName) ?? [];
  existingDistrictNumbers.push(districtNumber);
  OHIO_SCHOOL_DISTRICT_NAME_TO_NUMBERS.set(
    normalizedDistrictName,
    existingDistrictNumbers,
  );

  const abbreviatedName = abbreviateNormalizedDistrictName(normalizedDistrictName);
  if (abbreviatedName !== normalizedDistrictName) {
    const existingAbbreviated =
      OHIO_SCHOOL_DISTRICT_ABBREVIATED_NAME_TO_NUMBERS.get(abbreviatedName) ?? [];
    existingAbbreviated.push(districtNumber);
    OHIO_SCHOOL_DISTRICT_ABBREVIATED_NAME_TO_NUMBERS.set(abbreviatedName, existingAbbreviated);
  }
}

export function normalizeOhioSchoolDistrictNumber(districtNumber: string): string {
  const trimmed = districtNumber.trim();
  return /^\d+$/.test(trimmed) ? trimmed.padStart(4, "0") : trimmed;
}

export function normalizeOhioSchoolDistrictName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s*\((?:TRADITIONAL|EARNED INCOME)\)\s*/g, " ")
    .replace(/^SD\b\.?\s*#?\s*/i, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lookupOhioSchoolDistrictMetadata(
  taxYear: number,
  districtNumber: string,
): OhioSchoolDistrictMetadata | null {
  const normalizedDistrictNumber = normalizeOhioSchoolDistrictNumber(districtNumber);
  const asOfDate = Number(`${taxYear}0101`);

  const period = OHIO_SCHOOL_DISTRICT_RATE_PERIODS.find((entry) =>
    entry.districtNumber === normalizedDistrictNumber &&
    entry.startDate <= asOfDate &&
    entry.endDate >= asOfDate,
  );

  if (!period) {
    return null;
  }

  return {
    districtNumber: normalizedDistrictNumber,
    taxType: period.taxType,
    rate: new Decimal(period.rate),
  };
}

export function lookupOhioSchoolDistrictNumberByName(
  districtName: string,
): string | null {
  const normalizedDistrictName = normalizeOhioSchoolDistrictName(districtName);
  if (!normalizedDistrictName) {
    return null;
  }

  const matchingDistrictNumbers =
    OHIO_SCHOOL_DISTRICT_NAME_TO_NUMBERS.get(normalizedDistrictName) ?? [];
  if (matchingDistrictNumbers.length === 1) {
    return matchingDistrictNumbers[0]!;
  }

  // Fallback: treat the normalized input as an abbreviated name (without CSD/LSD/EVSD suffix)
  // and check if it uniquely matches an official district's abbreviated name.
  const abbreviatedMatches =
    OHIO_SCHOOL_DISTRICT_ABBREVIATED_NAME_TO_NUMBERS.get(normalizedDistrictName) ?? [];
  return abbreviatedMatches.length === 1 ? abbreviatedMatches[0]! : null;
}

export function lookupOhioSchoolDistrictMetadataByDistrictName(
  taxYear: number,
  districtName: string,
): OhioSchoolDistrictMetadata | null {
  const districtNumber = lookupOhioSchoolDistrictNumberByName(districtName);
  return districtNumber
    ? lookupOhioSchoolDistrictMetadata(taxYear, districtNumber)
    : null;
}

export function lookupOhioSchoolDistrictNumberFromLocalityLabel(
  localityLabel: string,
): string | null {
  const trimmedLabel = localityLabel.trim();
  if (!/^SD\b/i.test(trimmedLabel)) {
    return null;
  }

  const numericDistrictMatch = trimmedLabel.match(/^SD\s*#?\s*(\d{1,4})(?:\b.*)?$/i);
  if (numericDistrictMatch) {
    return normalizeOhioSchoolDistrictNumber(numericDistrictMatch[1]!);
  }

  return lookupOhioSchoolDistrictNumberByName(trimmedLabel);
}

export function lookupOhioSchoolDistrictMetadataFromLocalityLabel(
  taxYear: number,
  localityLabel: string,
): OhioSchoolDistrictMetadata | null {
  const districtNumber = lookupOhioSchoolDistrictNumberFromLocalityLabel(
    localityLabel,
  );
  return districtNumber
    ? lookupOhioSchoolDistrictMetadata(taxYear, districtNumber)
    : null;
}
