<?php
/**
 * MES 系统 - 轻量 XLSX 生成器（无第三方依赖，基于 ZipArchive）
 * 支持：多 Sheet、标题行、表头行、数值/文本单元格、列宽、行数上限。
 */

class Xlsx
{
    /** 单 Sheet 最大导出行数 */
    const MAX_EXPORT_ROWS = 10000;

    /**
     * 构建 xlsx 二进制
     * @param array<int,array<string,mixed>> $sheets Sheet 定义
     *   [ 'name' => 'Sheet1', 'title' => '标题', 'columns' => [['header'=>'','key'=>'','width'=>16,'type'=>'text']], 'rows' => [] ]
     * @return string
     * @throws HttpException 400
     */
    public static function build($sheets)
    {
        if (!is_array($sheets) || count($sheets) === 0) {
            throw new HttpException('导出列定义不能为空', 400);
        }

        foreach ($sheets as $sheet) {
            $rows = isset($sheet['rows']) ? $sheet['rows'] : array();
            if (count($rows) > self::MAX_EXPORT_ROWS) {
                throw new HttpException(
                    '导出数据量 ' . count($rows) . ' 行超出单次上限 ' . self::MAX_EXPORT_ROWS
                    . ' 行，请收窄查询时间范围后重试',
                    400
                );
            }
        }

        $temp = tempnam(sys_get_temp_dir(), 'mesxlsx');
        if ($temp === false) {
            throw new RuntimeException('无法创建临时文件');
        }
        $zip = new ZipArchive();
        if ($zip->open($temp, ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('无法创建 xlsx 文件');
        }

        $sheetCount = count($sheets);
        $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
        for ($i = 1; $i <= $sheetCount; $i++) {
            $contentTypes .= '<Override PartName="/xl/worksheets/sheet' . $i
                . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }
        $contentTypes .= '</Types>';

        $rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';

        $workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
        $workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';

        foreach ($sheets as $index => $sheet) {
            $number = $index + 1;
            $name = isset($sheet['name']) ? (string) $sheet['name'] : ('Sheet' . $number);
            $name = mb_substr($name, 0, 31);
            $workbook .= '<sheet name="' . self::escape($name) . '" sheetId="' . $number
                . '" r:id="rId' . $number . '"/>';
            $workbookRels .= '<Relationship Id="rId' . $number
                . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
                . 'Target="worksheets/sheet' . $number . '.xml"/>';
        }
        $workbook .= '</sheets></workbook>';
        $workbookRels .= '<Relationship Id="rId' . ($sheetCount + 1)
            . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>';

        $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
            . '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
            . '<fills count="2"><fill><patternFill patternType="none"/></fill>'
            . '<fill><patternFill patternType="solid"><fgColor rgb="FF1677FF"/><bgColor indexed="64"/></patternFill></fill></fills>'
            . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            . '<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
            . '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            . '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

        $zip->addFromString('[Content_Types].xml', $contentTypes);
        $zip->addFromString('_rels/.rels', $rootRels);
        $zip->addFromString('xl/workbook.xml', $workbook);
        $zip->addFromString('xl/_rels/workbook.xml.rels', $workbookRels);
        $zip->addFromString('xl/styles.xml', $styles);

        foreach ($sheets as $index => $sheet) {
            $xml = self::sheetXml($sheet);
            $zip->addFromString('xl/worksheets/sheet' . ($index + 1) . '.xml', $xml);
        }

        $zip->close();
        $buffer = file_get_contents($temp);
        @unlink($temp);
        return $buffer === false ? '' : $buffer;
    }

    /**
     * 生成单个 Sheet XML
     * @param array<string,mixed> $sheet Sheet 定义
     * @return string
     */
    private static function sheetXml($sheet)
    {
        $columns = isset($sheet['columns']) && is_array($sheet['columns']) ? $sheet['columns'] : array();
        $rows = isset($sheet['rows']) && is_array($sheet['rows']) ? $sheet['rows'] : array();
        $title = isset($sheet['title']) ? (string) $sheet['title'] : '';
        $columnCount = max(1, count($columns));

        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

        if (count($columns) > 0) {
            $xml .= '<cols>';
            foreach ($columns as $index => $column) {
                $width = isset($column['width']) ? (float) $column['width'] : 16;
                $xml .= '<col min="' . ($index + 1) . '" max="' . ($index + 1)
                    . '" width="' . $width . '" customWidth="1"/>';
            }
            $xml .= '</cols>';
        }

        $xml .= '<sheetData>';
        $rowNumber = 1;

        if ($title !== '') {
            $xml .= '<row r="1">' . self::stringCell('A1', $title) . '</row>';
            $rowNumber = 2;
        }

        if (count($columns) > 0) {
            $xml .= '<row r="' . $rowNumber . '">';
            foreach ($columns as $index => $column) {
                $header = isset($column['header']) ? (string) $column['header'] : '';
                $ref = self::columnLetter($index + 1) . $rowNumber;
                $xml .= '<c r="' . $ref . '" t="inlineStr" s="1"><is><t xml:space="preserve">'
                    . self::escape($header) . '</t></is></c>';
            }
            $xml .= '</row>';
            $rowNumber += 1;
        }

        foreach ($rows as $row) {
            $xml .= '<row r="' . $rowNumber . '">';
            foreach ($columns as $index => $column) {
                $key = isset($column['key']) ? $column['key'] : '';
                $type = isset($column['type']) ? $column['type'] : 'text';
                $value = is_array($row) && array_key_exists($key, $row) ? $row[$key] : '';
                $ref = self::columnLetter($index + 1) . $rowNumber;

                if ($value === null || $value === '') {
                    $xml .= '<c r="' . $ref . '"/>';
                } elseif ($type === 'number' && is_numeric($value)) {
                    $xml .= '<c r="' . $ref . '"><v>' . (0 + $value) . '</v></c>';
                } else {
                    $xml .= self::stringCell($ref, (string) $value);
                }
            }
            $xml .= '</row>';
            $rowNumber += 1;
        }
        $xml .= '</sheetData>';

        if ($title !== '') {
            $xml .= '<mergeCells count="1"><mergeCell ref="A1:'
                . self::columnLetter($columnCount) . '1"/></mergeCells>';
        }

        $xml .= '</worksheet>';
        return $xml;
    }

    /**
     * 内联字符串单元格
     * @param string $ref 单元格引用
     * @param string $value 值
     * @return string
     */
    private static function stringCell($ref, $value)
    {
        return '<c r="' . $ref . '" t="inlineStr"><is><t xml:space="preserve">'
            . self::escape($value) . '</t></is></c>';
    }

    /**
     * 列序号 → 列字母
     * @param int $index 从 1 开始
     * @return string
     */
    private static function columnLetter($index)
    {
        $letters = '';
        while ($index > 0) {
            $mod = ($index - 1) % 26;
            $letters = chr(65 + $mod) . $letters;
            $index = (int) (($index - $mod) / 26);
        }
        return $letters;
    }

    /**
     * XML 转义
     * @param string $text 文本
     * @return string
     */
    private static function escape($text)
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /**
     * 输出下载响应
     * @param string $buffer xlsx 内容
     * @param string $filename 文件名
     * @return void
     */
    public static function download($buffer, $filename)
    {
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode($filename));
        header('Content-Length: ' . strlen($buffer));
        header('Access-Control-Expose-Headers: Content-Disposition');
        echo $buffer;
        exit;
    }
}
