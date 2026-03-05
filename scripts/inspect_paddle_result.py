#!/usr/bin/env python3
"""Inspect PaddleOCR-VL result structure for a sample PDF."""

from __future__ import annotations

from paddleocr import PaddleOCRVL


def keywalk(obj, depth: int = 0, max_depth: int = 3):
    if depth > max_depth:
        return []
    keys = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            keys.append((depth, key, type(value).__name__))
            keys.extend(keywalk(value, depth + 1, max_depth))
    elif isinstance(obj, list) and obj:
        keys.extend(keywalk(obj[0], depth + 1, max_depth))
    return keys


def collect_text_fields(obj, path: str = "", output: list[tuple[str, str]] | None = None):
    if output is None:
        output = []

    if isinstance(obj, dict):
        for key, value in obj.items():
            field_path = f"{path}.{key}" if path else str(key)
            if isinstance(value, str) and ("text" in key.lower() or "content" in key.lower()):
                output.append((field_path, value[:200]))
            collect_text_fields(value, field_path, output)
    elif isinstance(obj, list):
        for index, value in enumerate(obj[:20]):
            collect_text_fields(value, f"{path}[{index}]", output)

    return output


def main() -> None:
    model = PaddleOCRVL(
        pipeline_version="v1.5",
        use_doc_orientation_classify=True,
        use_doc_unwarping=False,
    )
    outputs = model.predict("/app/uploads/AS_161723_LJ-X8000_C_635I91_KK_KR_2105_2_image_p1.pdf")
    print("result_count:", len(outputs))
    item = outputs[0]
    print("result_type:", type(item))
    print("has_to_dict:", hasattr(item, "to_dict"))

    if hasattr(item, "to_dict"):
        payload = item.to_dict()
    elif isinstance(item, dict):
        payload = item
    else:
        payload = {}

    top_keys = list(payload.keys())
    print("top_keys:", top_keys[:30])

    print("\nkeywalk:")
    for depth, key, value_type in keywalk(payload, 0, 3)[:200]:
        print("  " * depth + f"{key}: {value_type}")

    text_fields = collect_text_fields(payload)
    print("\ntext_fields:", len(text_fields))
    for field_path, preview in text_fields[:80]:
        print(f"{field_path} => {preview}")

    parsing = payload.get("parsing_res_list", [])
    print("\nparsing_res_list_len:", len(parsing) if isinstance(parsing, list) else "n/a")
    if isinstance(parsing, list) and parsing:
        first = parsing[0]
        print("parsing_first_type:", type(first))
        print("parsing_first_str:", str(first)[:500])
        if hasattr(first, "to_dict"):
            try:
                first_dict = first.to_dict()
                print("parsing_first_to_dict_keys:", list(first_dict.keys())[:40])
                for path, preview in collect_text_fields(first_dict)[:40]:
                    print(f"parsing_text::{path} => {preview}")
            except Exception as exc:  # noqa: BLE001
                print("parsing_first_to_dict_error:", exc)

    spotting = payload.get("spotting_res", {})
    print("\nspotting_res_type:", type(spotting))
    print("spotting_res_str:", str(spotting)[:500])
    if isinstance(spotting, dict):
        print("spotting_res_keys:", list(spotting.keys())[:40])
        for path, preview in collect_text_fields(spotting)[:40]:
            print(f"spotting_text::{path} => {preview}")


if __name__ == "__main__":
    main()
