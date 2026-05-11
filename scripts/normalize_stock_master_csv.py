#!/usr/bin/env python3
"""
JPX 주식 마스터 CSV의 market_segment 열을 정리된 값으로 변환합니다.

사용법:
    python scripts/normalize_stock_master_csv.py \
        input.csv \
        --output output.csv

    # 또는 덮어쓰기 (원본 백업 자동 생성)
    python scripts/normalize_stock_master_csv.py input.csv --in-place
"""

import argparse
import csv
import sys
from pathlib import Path
from collections import Counter


# JPX market_segment → 정리된 값 매핑
MARKET_SEGMENT_MAP: dict[str, str] = {
    # 내국주식
    "プライム（内国株式）": "TSE Prime",
    "スタンダード（内国株式）": "TSE Standard",
    "グロース（内国株式）": "TSE Growth",
    # 외국주식
    "プライム（外国株式）": "TSE Prime (Foreign)",
    "スタンダード（外国株式）": "TSE Standard (Foreign)",
    "グロース（外国株式）": "TSE Growth (Foreign)",
    # ETF/ETN
    "ETF・ETN": "ETF/ETN",
    # REIT / Fund
    "REIT・ベンチャーファンド・カントリーファンド・インフラファンド": "REIT/Fund",
    # 출자증권
    "出資証券": "Investment",
    # PRO Market
    "PRO Market": "TSE Pro",
    # 기타 (과거 시장 구분 등)
    "マザーズ": "TSE Mothers",
    "JASDAQ": "JASDAQ",
}


def normalize_market_segment(raw: str) -> tuple[str, bool]:
    """
    원본 market_segment 값을 정리된 값으로 변환합니다.

    Returns:
        (정리된 값, 매핑 성공 여부)
    """
    trimmed = raw.strip()
    if trimmed in MARKET_SEGMENT_MAP:
        return MARKET_SEGMENT_MAP[trimmed], True
    return trimmed, False


def process_csv(input_path: Path, output_path: Path) -> None:
    """CSV를 읽어 market_segment를 정리하고 새 파일로 저장합니다."""
    with input_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            print("오류: 입력 파일이 비어 있습니다.", file=sys.stderr)
            sys.exit(1)

        # 헤더 검증
        expected_header = ["ticker", "name", "market_segment"]
        lower_header = [h.strip().lower() for h in header]
        if lower_header != expected_header:
            print(
                f"오류: 헤더가 예상과 다릅니다.\n"
                f"  예상: {expected_header}\n"
                f"  실제: {lower_header}",
                file=sys.stderr,
            )
            sys.exit(1)

        rows: list[list[str]] = []
        unmapped_counter: Counter[str] = Counter()
        mapped_counter: Counter[str] = Counter()

        for idx, row in enumerate(reader, start=2):
            if not row:
                continue
            if len(row) < 3:
                print(f"경고: {idx}번째 행에 열이 부족합니다 ({len(row)}개). 건 넘깁니다.", file=sys.stderr)
                continue

            ticker, name, market_segment = row[0], row[1], row[2]
            normalized, was_mapped = normalize_market_segment(market_segment)

            if was_mapped:
                mapped_counter[market_segment.strip()] += 1
            else:
                unmapped_counter[market_segment.strip()] += 1

            rows.append([ticker, name, normalized])

    # 출력
    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)

    # 요약 출력
    print(f"\n처리 완료: {len(rows)}개 행")
    print(f"출력 파일: {output_path.resolve()}")

    if mapped_counter:
        print(f"\n✅ 매핑된 값 ({len(mapped_counter)}종):")
        for raw, count in mapped_counter.most_common():
            mapped = MARKET_SEGMENT_MAP[raw]
            print(f"   {count:>5}건  '{raw}' → '{mapped}'")

    if unmapped_counter:
        print(f"\n⚠️  매핑되지 않은 값 ({len(unmapped_counter)}종) — 원본 그대로 유지됨:")
        for raw, count in unmapped_counter.most_common():
            print(f"   {count:>5}건  '{raw}'")
        print(
            "\n💡 힌트: 위 값들을 MARKET_SEGMENT_MAP에 추가하려면 "
            "scripts/normalize_stock_master_csv.py를 수정하세요."
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="JPX 주식 마스터 CSV의 market_segment를 정리된 값으로 변환합니다."
    )
    parser.add_argument("input", type=Path, help="입력 CSV 파일 경로")
    parser.add_argument(
        "--output", "-o", type=Path, default=None, help="출력 CSV 파일 경로 (기본: input_normalized.csv)"
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="원본 파일을 덮어쓰고 .bak 백업을 생성합니다.",
    )

    args = parser.parse_args()
    input_path: Path = args.input

    if not input_path.exists():
        print(f"오류: 파일을 찾을 수 없습니다: {input_path}", file=sys.stderr)
        sys.exit(1)

    if args.in_place:
        backup_path = input_path.with_suffix(input_path.suffix + ".bak")
        input_path.rename(backup_path)
        print(f"백업 생성: {backup_path}")
        output_path = input_path
    else:
        output_path = args.output or input_path.with_stem(input_path.stem + "_normalized")

    process_csv(backup_path if args.in_place else input_path, output_path)


if __name__ == "__main__":
    main()
