<?php
/**
 * MES 系统 - 物料 / BOM / 库存 / 批次 / 追溯接口
 */

class MaterialController
{
    /**
     * 库存预警统一口径
     * @param array<string,mixed> $inventory 库存
     * @return array<string,mixed>
     */
    public static function evaluateWarning($inventory)
    {
        $quantity = isset($inventory['quantity']) ? (float) $inventory['quantity'] : 0;
        $safetyStock = isset($inventory['safetyStock']) ? (float) $inventory['safetyStock'] : 0;
        if ($safetyStock <= 0 || $quantity >= $safetyStock) {
            return array('isLowStock' => false, 'level' => null, 'shortage' => 0, 'shortageRatio' => 0);
        }
        $shortage = $safetyStock - $quantity;
        $level = ($quantity <= 0 || $quantity < $safetyStock * 0.5) ? 'critical' : 'warning';
        return array(
            'isLowStock' => true,
            'level' => $level,
            'shortage' => $shortage,
            'shortageRatio' => $shortage / $safetyStock,
        );
    }

    /**
     * 库存行 → 输出（含物料与预警字段）
     * @param array<string,mixed> $row 行
     * @return array<string,mixed>
     */
    private static function formatInventory($row)
    {
        $material = null;
        if (isset($row['materialCode']) && $row['materialCode'] !== null) {
            $material = array(
                'id' => (int) $row['materialId'],
                'code' => $row['materialCode'],
                'name' => $row['materialName'],
                'specification' => $row['materialSpecification'],
                'unit' => $row['materialUnit'],
                'type' => $row['materialType'],
            );
        }
        unset(
            $row['materialCode'],
            $row['materialName'],
            $row['materialSpecification'],
            $row['materialUnit'],
            $row['materialType']
        );
        $row['id'] = (int) $row['id'];
        $row['materialId'] = (int) $row['materialId'];
        $row['quantity'] = (float) $row['quantity'];
        $row['safetyStock'] = (float) $row['safetyStock'];
        $row['maxStock'] = (float) $row['maxStock'];
        $row['material'] = $material;
        return array_merge($row, self::evaluateWarning($row));
    }

    /**
     * 查询库存
     * @param string $where WHERE
     * @param array<int,mixed> $bind 参数
     * @param string $limit LIMIT 片段
     * @return array<int,array<string,mixed>>
     */
    private static function queryInventory($where, $bind, $limit = '')
    {
        $sql = 'SELECT inv.*, m.code AS materialCode, m.name AS materialName,'
            . ' m.specification AS materialSpecification, m.unit AS materialUnit, m.type AS materialType'
            . ' FROM inventory inv LEFT JOIN materials m ON m.id = inv.materialId'
            . ($where !== '' ? ' WHERE ' . $where : '')
            . ' ORDER BY inv.updatedAt DESC' . ($limit !== '' ? ' ' . $limit : '');
        $rows = Db::all($sql, $bind, 'inventory');
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::formatInventory($row);
        }
        return $list;
    }

    /**
     * GET /api/materials
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function index($params)
    {
        list($page, $pageSize) = Http::pagination();
        $keyword = Http::query('keyword');
        $type = Http::query('type');
        $category = Http::query('category');

        $where = array();
        $bind = array();
        if ($keyword !== null && $keyword !== '') {
            $where[] = '(code LIKE ? OR name LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
        }
        if ($type !== null) {
            $where[] = 'type = ?';
            $bind[] = $type;
        }
        if ($category !== null) {
            $where[] = 'category LIKE ?';
            $bind[] = '%' . $category . '%';
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        $total = (int) Db::val('SELECT COUNT(*) FROM materials' . $whereSql, $bind);
        $materials = Db::all(
            'SELECT * FROM materials' . $whereSql . ' ORDER BY createdAt DESC LIMIT ' . $pageSize
            . ' OFFSET ' . (($page - 1) * $pageSize),
            $bind,
            'materials'
        );

        $ids = array();
        foreach ($materials as $material) {
            $ids[] = (int) $material['id'];
        }
        $inventoryMap = array();
        if (count($ids) > 0) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $rows = Db::all(
                'SELECT id, materialId, quantity, safetyStock, maxStock, warehouse, location'
                . ' FROM inventory WHERE materialId IN (' . $placeholders . ')',
                $ids,
                'inventory'
            );
            foreach ($rows as $row) {
                $inventoryMap[(int) $row['materialId']] = array(
                    'id' => (int) $row['id'],
                    'quantity' => $row['quantity'],
                    'safetyStock' => $row['safetyStock'],
                    'maxStock' => $row['maxStock'],
                    'warehouse' => $row['warehouse'],
                    'location' => $row['location'],
                );
            }
        }

        $list = array();
        foreach ($materials as $material) {
            $id = (int) $material['id'];
            $material['id'] = $id;
            $material['inventory'] = isset($inventoryMap[$id]) ? $inventoryMap[$id] : null;
            $list[] = $material;
        }

        Http::paginated($list, $total, $page, $pageSize, '查询物料列表成功');
    }

    /**
     * 物料详情
     * @param int $id 物料 ID
     * @return array<string,mixed>
     */
    private static function materialDetail($id)
    {
        $material = Db::one('SELECT * FROM materials WHERE id = ?', array($id), 'materials');
        if ($material === null) {
            throw new HttpException('物料不存在', 404);
        }
        $inventory = Db::one('SELECT * FROM inventory WHERE materialId = ?', array($id), 'inventory');
        if ($inventory !== null) {
            $inventory['id'] = (int) $inventory['id'];
            $inventory['materialId'] = (int) $inventory['materialId'];
        }
        $material['id'] = (int) $material['id'];
        $material['inventory'] = $inventory;
        return $material;
    }

    /**
     * GET /api/materials/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function show($params)
    {
        Http::ok(self::materialDetail((int) $params['id']));
    }

    /**
     * POST /api/materials
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function store($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'code' => 'required|string|min:1|max:50',
            'name' => 'required|string|min:1|max:100',
            'specification' => 'required|string|min:1|max:100',
            'unit' => 'required|string|min:1|max:20',
            'category' => 'required|string|min:1|max:50',
            'type' => 'required|in:raw,semi,finished',
        ));

        $code = trim((string) $body['code']);
        if (Db::val('SELECT COUNT(*) FROM materials WHERE code = ?', array($code)) > 0) {
            throw new HttpException('物料编码已存在', 409);
        }

        $now = Db::nowParam();
        $id = Db::tx(function () use ($body, $code, $now) {
            $materialId = Db::insert('materials', array(
                'code' => $code,
                'name' => $body['name'],
                'specification' => $body['specification'],
                'unit' => $body['unit'],
                'category' => $body['category'],
                'type' => $body['type'],
                'description' => isset($body['description']) ? (string) $body['description'] : '',
                'createdAt' => $now,
                'updatedAt' => $now,
            ));
            Db::insert('inventory', array(
                'materialId' => $materialId,
                'warehouse' => '默认仓库',
                'location' => '默认库位',
                'quantity' => 0,
                'safetyStock' => 0,
                'maxStock' => 0,
                'updatedAt' => $now,
            ));
            return $materialId;
        });

        Http::created(self::materialDetail((int) $id), '创建物料成功');
    }

    /**
     * PUT /api/materials/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function update($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'name' => 'string|min:1|max:100',
            'type' => 'in:raw,semi,finished',
        ));

        if ((int) Db::val('SELECT COUNT(*) FROM materials WHERE id = ?', array($id)) === 0) {
            throw new HttpException('物料不存在', 404);
        }

        $data = array('updatedAt' => Db::nowParam());
        foreach (array('name', 'specification', 'unit', 'category', 'type', 'description') as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        Db::update('materials', $data, 'id = ?', array($id));

        Http::ok(self::materialDetail($id), '更新物料成功');
    }

    /**
     * DELETE /api/materials/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function destroy($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM materials WHERE id = ?', array($id)) === 0) {
            throw new HttpException('物料不存在', 404);
        }
        Db::exec('DELETE FROM materials WHERE id = ?', array($id));
        Http::ok(null, '删除物料成功（关联库存与出入库记录已级联删除）');
    }

    /**
     * BOM 明细输出
     * @param array<string,mixed> $row 行
     * @param bool $withType 物料是否含类型
     * @return array<string,mixed>
     */
    private static function formatBomItem($row, $withType = true)
    {
        $material = null;
        if (isset($row['materialCode']) && $row['materialCode'] !== null) {
            $material = array(
                'id' => (int) $row['materialId'],
                'code' => $row['materialCode'],
                'name' => $row['materialName'],
                'specification' => $row['materialSpecification'],
                'unit' => $row['materialUnit'],
            );
            if ($withType) {
                $material['type'] = $row['materialType'];
            }
        }
        unset(
            $row['materialCode'],
            $row['materialName'],
            $row['materialSpecification'],
            $row['materialUnit'],
            $row['materialType']
        );
        $row['id'] = (int) $row['id'];
        $row['bomId'] = (int) $row['bomId'];
        $row['materialId'] = (int) $row['materialId'];
        $row['quantity'] = (float) $row['quantity'];
        $row['material'] = $material;
        return $row;
    }

    /**
     * 读取 BOM 明细
     * @param int $bomId BOM ID
     * @param bool $withType 是否含类型
     * @return array<int,array<string,mixed>>
     */
    private static function bomItems($bomId, $withType = true)
    {
        $rows = Db::all(
            'SELECT bi.*, m.code AS materialCode, m.name AS materialName,'
            . ' m.specification AS materialSpecification, m.unit AS materialUnit, m.type AS materialType'
            . ' FROM bom_items bi LEFT JOIN materials m ON m.id = bi.materialId'
            . ' WHERE bi.bomId = ? ORDER BY bi.id ASC',
            array($bomId)
        );
        $list = array();
        foreach ($rows as $row) {
            $list[] = self::formatBomItem($row, $withType);
        }
        return $list;
    }

    /**
     * GET /api/materials/boms
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function boms($params)
    {
        list($page, $pageSize) = Http::pagination();
        $keyword = Http::query('keyword');

        $where = '';
        $bind = array();
        if ($keyword !== null && $keyword !== '') {
            $where = ' WHERE (productCode LIKE ? OR productName LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
        }

        $total = (int) Db::val('SELECT COUNT(*) FROM boms' . $where, $bind);
        $rows = Db::all(
            'SELECT b.*, (SELECT COUNT(*) FROM bom_items bi WHERE bi.bomId = b.id) AS itemCount'
            . ' FROM boms b' . $where . ' ORDER BY b.createdAt DESC LIMIT ' . $pageSize
            . ' OFFSET ' . (($page - 1) * $pageSize),
            $bind,
            'boms'
        );
        $list = array();
        foreach ($rows as $row) {
            $itemCount = (int) $row['itemCount'];
            unset($row['itemCount']);
            $row['id'] = (int) $row['id'];
            $row['_count'] = array('items' => $itemCount);
            $list[] = $row;
        }

        Http::paginated($list, $total, $page, $pageSize, '查询 BOM 列表成功');
    }

    /**
     * BOM 详情
     * @param int $id BOM ID
     * @return array<string,mixed>
     */
    private static function bomDetail($id)
    {
        $bom = Db::one('SELECT * FROM boms WHERE id = ?', array($id), 'boms');
        if ($bom === null) {
            throw new HttpException('BOM 不存在', 404);
        }
        $bom['id'] = (int) $bom['id'];
        $bom['items'] = self::bomItems($id, true);
        return $bom;
    }

    /**
     * GET /api/materials/boms/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function bom($params)
    {
        Http::ok(self::bomDetail((int) $params['id']));
    }

    /**
     * 校验 BOM 明细并规整
     * @param array<int,mixed> $items 明细
     * @return array<int,array<string,mixed>>
     */
    private static function normalizeItems($items)
    {
        $result = array();
        foreach ($items as $item) {
            if (!is_array($item) || empty($item['materialId'])) {
                continue;
            }
            $result[] = array(
                'materialId' => (int) $item['materialId'],
                'quantity' => isset($item['quantity']) ? (float) $item['quantity'] : 1,
                'unit' => isset($item['unit']) ? (string) $item['unit'] : '',
                'remark' => isset($item['remark']) ? (string) $item['remark'] : '',
            );
        }
        if (count($result) === 0) {
            throw new HttpException('参数校验失败', 400, array(
                array('field' => 'items', 'message' => 'BOM 至少需要一个物料明细'),
            ));
        }
        $ids = array();
        foreach ($result as $item) {
            $ids[] = $item['materialId'];
        }
        $ids = array_values(array_unique($ids));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $exists = (int) Db::val('SELECT COUNT(*) FROM materials WHERE id IN (' . $placeholders . ')', $ids);
        if ($exists !== count($ids)) {
            throw new HttpException('BOM 明细中的物料不存在', 400);
        }
        return $result;
    }

    /**
     * POST /api/materials/boms
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createBom($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'productCode' => 'required|string|min:1|max:50',
            'productName' => 'required|string|min:1|max:100',
            'version' => 'required|string|min:1|max:20',
            'items' => 'required|array',
        ));
        $items = self::normalizeItems($body['items']);

        $bomId = Db::tx(function () use ($body, $items) {
            $now = Db::nowParam();
            $id = Db::insert('boms', array(
                'productCode' => $body['productCode'],
                'productName' => $body['productName'],
                'version' => $body['version'],
                'status' => 1,
                'remark' => isset($body['remark']) ? (string) $body['remark'] : '',
                'createdAt' => $now,
                'updatedAt' => $now,
            ));
            foreach ($items as $item) {
                Db::insert('bom_items', array(
                    'bomId' => $id,
                    'materialId' => $item['materialId'],
                    'quantity' => $item['quantity'],
                    'unit' => $item['unit'],
                    'remark' => $item['remark'],
                ));
            }
            return $id;
        });

        Http::created(self::bomDetail((int) $bomId), '创建 BOM 成功');
    }

    /**
     * PUT /api/materials/boms/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updateBom($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'productName' => 'string|min:1|max:100',
            'version' => 'string|min:1|max:20',
            'status' => 'bool',
        ));

        if ((int) Db::val('SELECT COUNT(*) FROM boms WHERE id = ?', array($id)) === 0) {
            throw new HttpException('BOM 不存在', 404);
        }
        $items = array_key_exists('items', $body) ? self::normalizeItems((array) $body['items']) : null;

        Db::tx(function () use ($id, $body, $items) {
            $data = array('updatedAt' => Db::nowParam());
            foreach (array('productName', 'version', 'remark') as $field) {
                if (array_key_exists($field, $body)) {
                    $data[$field] = $body[$field];
                }
            }
            if (array_key_exists('status', $body)) {
                $data['status'] = filter_var($body['status'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
            }
            Db::update('boms', $data, 'id = ?', array($id));

            if ($items !== null) {
                Db::exec('DELETE FROM bom_items WHERE bomId = ?', array($id));
                foreach ($items as $item) {
                    Db::insert('bom_items', array(
                        'bomId' => $id,
                        'materialId' => $item['materialId'],
                        'quantity' => $item['quantity'],
                        'unit' => $item['unit'],
                        'remark' => $item['remark'],
                    ));
                }
            }
            return null;
        });

        Http::ok(self::bomDetail($id), '更新 BOM 成功');
    }

    /**
     * DELETE /api/materials/boms/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function destroyBom($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM boms WHERE id = ?', array($id)) === 0) {
            throw new HttpException('BOM 不存在', 404);
        }
        Db::tx(function () use ($id) {
            Db::exec('DELETE FROM bom_items WHERE bomId = ?', array($id));
            Db::exec('DELETE FROM boms WHERE id = ?', array($id));
            return null;
        });
        Http::ok(null, '删除 BOM 成功');
    }

    /**
     * GET /api/materials/inventory
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function inventory($params)
    {
        list($page, $pageSize) = Http::pagination();
        $keyword = Http::query('keyword');
        $warning = Http::query('warning');

        $where = array();
        $bind = array();
        if ($keyword !== null && $keyword !== '') {
            $where[] = '(m.code LIKE ? OR m.name LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        if ($warning === 'true' || $warning === '1') {
            $all = self::queryInventory($whereSql, $bind);
            $filtered = array();
            foreach ($all as $item) {
                if ($item['isLowStock']) {
                    $filtered[] = $item;
                }
            }
            $total = count($filtered);
            $list = array_slice($filtered, ($page - 1) * $pageSize, $pageSize);
            Http::paginated($list, $total, $page, $pageSize, '查询库存列表成功');
        }

        $total = (int) Db::val(
            'SELECT COUNT(*) FROM inventory inv LEFT JOIN materials m ON m.id = inv.materialId' . $whereSql,
            $bind
        );
        $list = self::queryInventory(
            $whereSql,
            $bind,
            'LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );
        Http::paginated($list, $total, $page, $pageSize, '查询库存列表成功');
    }

    /**
     * GET /api/materials/inventory/warnings
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function warnings($params)
    {
        list($page, $pageSize) = Http::pagination();
        $keyword = Http::query('keyword');
        $level = Http::query('level');

        $where = array();
        $bind = array();
        if ($keyword !== null && $keyword !== '') {
            $where[] = '(m.code LIKE ? OR m.name LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        $all = self::queryInventory($whereSql, $bind);
        $filtered = array();
        foreach ($all as $item) {
            if (!$item['isLowStock']) {
                continue;
            }
            if ($level !== null && $item['level'] !== $level) {
                continue;
            }
            $filtered[] = $item;
        }

        $levelOrder = array('critical' => 0, 'warning' => 1);
        usort($filtered, function ($a, $b) use ($levelOrder) {
            $left = isset($levelOrder[$a['level']]) ? $levelOrder[$a['level']] : 9;
            $right = isset($levelOrder[$b['level']]) ? $levelOrder[$b['level']] : 9;
            if ($left !== $right) {
                return $left - $right;
            }
            if ($a['shortageRatio'] == $b['shortageRatio']) {
                return 0;
            }
            return $a['shortageRatio'] < $b['shortageRatio'] ? 1 : -1;
        });

        $total = count($filtered);
        $list = array_slice($filtered, ($page - 1) * $pageSize, $pageSize);
        Http::paginated($list, $total, $page, $pageSize, '查询库存预警成功');
    }

    /**
     * GET /api/materials/inventory/transactions
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function transactions($params)
    {
        list($page, $pageSize) = Http::pagination();
        $materialId = Http::queryInt('materialId');

        $where = '';
        $bind = array();
        if ($materialId !== null) {
            $where = ' WHERE it.materialId = ?';
            $bind[] = $materialId;
        }

        $total = (int) Db::val('SELECT COUNT(*) FROM inventory_transactions it' . $where, $bind);
        $rows = Db::all(
            'SELECT it.*, m.id AS mId, m.code AS materialCode, m.name AS materialName, m.unit AS materialUnit,'
            . ' u.name AS operatorName, u.department AS operatorDepartment'
            . ' FROM inventory_transactions it'
            . ' LEFT JOIN materials m ON m.id = it.materialId'
            . ' LEFT JOIN users u ON u.id = it.operatorId'
            . $where . ' ORDER BY it.transactionTime DESC LIMIT ' . $pageSize
            . ' OFFSET ' . (($page - 1) * $pageSize),
            $bind,
            'inventory_transactions'
        );

        $list = array();
        foreach ($rows as $row) {
            $operator = null;
            if ($row['operatorId'] !== null) {
                $operator = array(
                    'id' => (int) $row['operatorId'],
                    'name' => $row['operatorName'],
                    'department' => $row['operatorDepartment'],
                );
            }
            unset($row['operatorName'], $row['operatorDepartment'], $row['mId']);
            $row['id'] = (int) $row['id'];
            $row['materialId'] = (int) $row['materialId'];
            $row['quantity'] = (float) $row['quantity'];
            $row['operatorId'] = $row['operatorId'] === null ? null : (int) $row['operatorId'];
            $row['material'] = array(
                'id' => (int) $row['materialId'],
                'code' => $row['materialCode'],
                'name' => $row['materialName'],
                'unit' => $row['materialUnit'],
            );
            unset($row['materialCode'], $row['materialName'], $row['materialUnit']);
            $row['operator'] = $operator;
            $list[] = $row;
        }

        Http::paginated($list, $total, $page, $pageSize, '查询出入库记录成功');
    }

    /**
     * POST /api/materials/inventory/transactions
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createTransaction($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'materialId' => 'required|int|positive',
            'transactionType' => 'required|in:in,out',
            'quantity' => 'required|number|positive',
            'batchNo' => 'string|max:50',
            'relatedOrder' => 'string|max:50',
            'remark' => 'string|max:500',
        ));

        $materialId = (int) $body['materialId'];
        $type = (string) $body['transactionType'];
        $quantity = (float) $body['quantity'];
        $material = Db::one(
            'SELECT m.id, inv.id AS inventoryId, inv.quantity AS stock'
            . ' FROM materials m LEFT JOIN inventory inv ON inv.materialId = m.id WHERE m.id = ?',
            array($materialId)
        );
        if ($material === null) {
            throw new HttpException('物料不存在', 404);
        }
        if ($material['inventoryId'] === null) {
            throw new HttpException('该物料尚未初始化库存记录', 400);
        }
        if ($type === 'out' && (float) $material['stock'] < $quantity) {
            throw new HttpException(
                '库存不足：当前库存 ' . (float) $material['stock'] . '，需出库 ' . $quantity,
                400
            );
        }

        $current = Auth::user();
        $signed = $type === 'out' ? -$quantity : $quantity;

        $id = Db::tx(function () use ($materialId, $type, $quantity, $signed, $body, $current) {
            if ($type === 'out') {
                $affected = Db::exec(
                    'UPDATE inventory SET quantity = quantity - ?, updatedAt = ?'
                    . ' WHERE materialId = ? AND quantity >= ?',
                    array($quantity, Db::nowParam(), $materialId, $quantity)
                );
                if ($affected === 0) {
                    throw new HttpException('库存不足：并发操作导致库存已变化，请刷新后重试', 400);
                }
            } else {
                Db::exec(
                    'UPDATE inventory SET quantity = quantity + ?, updatedAt = ? WHERE materialId = ?',
                    array($quantity, Db::nowParam(), $materialId)
                );
            }

            return Db::insert('inventory_transactions', array(
                'materialId' => $materialId,
                'transactionType' => $type,
                'quantity' => $quantity,
                'batchNo' => isset($body['batchNo']) ? (string) $body['batchNo'] : '',
                'operatorId' => (int) $current['userId'],
                'relatedOrder' => isset($body['relatedOrder']) ? (string) $body['relatedOrder'] : '',
                'remark' => isset($body['remark']) ? (string) $body['remark'] : '',
                'transactionTime' => Db::nowParam(),
            ));
        });

        $created = Db::one(
            'SELECT * FROM inventory_transactions WHERE id = ?',
            array($id),
            'inventory_transactions'
        );
        $created['id'] = (int) $created['id'];
        $created['materialId'] = (int) $created['materialId'];
        Http::created($created, '出入库登记成功');
    }

    /**
     * GET /api/materials/batches
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function batches($params)
    {
        list($page, $pageSize) = Http::pagination();
        $where = array();
        $bind = array();
        $materialId = Http::queryInt('materialId');
        $batchNo = Http::query('batchNo');
        $supplier = Http::query('supplier');
        $status = Http::query('status');

        if ($materialId !== null) {
            $where[] = 'b.materialId = ?';
            $bind[] = $materialId;
        }
        if ($batchNo !== null) {
            $where[] = 'b.batchNo LIKE ?';
            $bind[] = '%' . $batchNo . '%';
        }
        if ($supplier !== null) {
            $where[] = 'b.supplier LIKE ?';
            $bind[] = '%' . $supplier . '%';
        }
        if ($status !== null) {
            $where[] = 'b.status = ?';
            $bind[] = $status;
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        $total = (int) Db::val('SELECT COUNT(*) FROM material_batches b' . $whereSql, $bind);
        $rows = Db::all(
            'SELECT b.*, m.code AS materialCode, m.name AS materialName,'
            . ' m.specification AS materialSpecification, m.unit AS materialUnit'
            . ' FROM material_batches b LEFT JOIN materials m ON m.id = b.materialId'
            . $whereSql . ' ORDER BY b.receivedDate DESC LIMIT ' . $pageSize
            . ' OFFSET ' . (($page - 1) * $pageSize),
            $bind,
            'material_batches'
        );

        $list = array();
        foreach ($rows as $row) {
            $row['id'] = (int) $row['id'];
            $row['materialId'] = (int) $row['materialId'];
            $row['quantity'] = (float) $row['quantity'];
            $row['material'] = array(
                'id' => (int) $row['materialId'],
                'code' => $row['materialCode'],
                'name' => $row['materialName'],
                'specification' => $row['materialSpecification'],
                'unit' => $row['materialUnit'],
            );
            unset($row['materialCode'], $row['materialName'], $row['materialSpecification'], $row['materialUnit']);
            $list[] = $row;
        }

        Http::paginated($list, $total, $page, $pageSize, '查询批次列表成功');
    }

    /**
     * 读取批次详情（含物料）
     * @param int $id 批次 ID
     * @return array<string,mixed>
     */
    private static function batchDetail($id)
    {
        $row = Db::one(
            'SELECT b.*, m.code AS materialCode, m.name AS materialName,'
            . ' m.specification AS materialSpecification, m.unit AS materialUnit'
            . ' FROM material_batches b LEFT JOIN materials m ON m.id = b.materialId WHERE b.id = ?',
            array($id),
            'material_batches'
        );
        if ($row === null) {
            throw new HttpException('批次不存在', 404);
        }
        $row['id'] = (int) $row['id'];
        $row['materialId'] = (int) $row['materialId'];
        $row['quantity'] = (float) $row['quantity'];
        $row['material'] = array(
            'id' => (int) $row['materialId'],
            'code' => $row['materialCode'],
            'name' => $row['materialName'],
            'specification' => $row['materialSpecification'],
            'unit' => $row['materialUnit'],
        );
        unset($row['materialCode'], $row['materialName'], $row['materialSpecification'], $row['materialUnit']);
        return $row;
    }

    /**
     * POST /api/materials/batches
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function createBatch($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'materialId' => 'required|int|positive',
            'batchNo' => 'required|string|min:1|max:50',
            'supplier' => 'required|string|min:1|max:100',
            'receivedDate' => 'required',
            'quantity' => 'required|number|positive',
            'status' => 'in:active,used,expired',
        ));

        $materialId = (int) $body['materialId'];
        if ((int) Db::val('SELECT COUNT(*) FROM materials WHERE id = ?', array($materialId)) === 0) {
            throw new HttpException('物料不存在', 404);
        }
        $batchNo = trim((string) $body['batchNo']);
        if ((int) Db::val('SELECT COUNT(*) FROM material_batches WHERE batchNo = ?', array($batchNo)) > 0) {
            throw new HttpException('批次号已存在：' . $batchNo, 409);
        }

        $now = Db::nowParam();
        $id = Db::insert('material_batches', array(
            'materialId' => $materialId,
            'batchNo' => $batchNo,
            'supplier' => $body['supplier'],
            'receivedDate' => Db::dateParam($body['receivedDate']),
            'quantity' => (float) $body['quantity'],
            'status' => isset($body['status']) && $body['status'] !== '' ? $body['status'] : 'active',
            'createdAt' => $now,
            'updatedAt' => $now,
        ));

        Http::created(self::batchDetail((int) $id), '创建批次成功');
    }

    /**
     * PUT /api/materials/batches/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function updateBatch($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'batchNo' => 'string|min:1|max:50',
            'supplier' => 'string|min:1|max:100',
            'quantity' => 'number|positive',
            'status' => 'in:active,used,expired',
        ));

        $existing = Db::one('SELECT * FROM material_batches WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('批次不存在', 404);
        }
        if (array_key_exists('batchNo', $body)) {
            $batchNo = trim((string) $body['batchNo']);
            if ($batchNo !== $existing['batchNo']) {
                $dup = (int) Db::val(
                    'SELECT COUNT(*) FROM material_batches WHERE batchNo = ? AND id <> ?',
                    array($batchNo, $id)
                );
                if ($dup > 0) {
                    throw new HttpException('批次号已存在：' . $batchNo, 409);
                }
            }
        }

        $data = array('updatedAt' => Db::nowParam());
        foreach (array('batchNo', 'supplier', 'status') as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }
        if (array_key_exists('receivedDate', $body)) {
            $data['receivedDate'] = Db::dateParam($body['receivedDate']);
        }
        if (array_key_exists('quantity', $body)) {
            $data['quantity'] = (float) $body['quantity'];
        }

        Db::update('material_batches', $data, 'id = ?', array($id));
        Http::ok(self::batchDetail($id), '更新批次成功');
    }

    /**
     * DELETE /api/materials/batches/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function deleteBatch($params)
    {
        $id = (int) $params['id'];
        if ((int) Db::val('SELECT COUNT(*) FROM material_batches WHERE id = ?', array($id)) === 0) {
            throw new HttpException('批次不存在', 404);
        }
        Db::exec('DELETE FROM material_batches WHERE id = ?', array($id));
        Http::ok(null, '删除批次成功');
    }

    /**
     * GET /api/materials/trace/forward
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function forwardTrace($params)
    {
        $batchNo = Http::query('batchNo');
        if ($batchNo === null || trim($batchNo) === '') {
            throw new HttpException('参数校验失败', 400, array(
                array('field' => 'batchNo', 'message' => '批次号不能为空'),
            ));
        }
        $batchNo = trim($batchNo);

        $batchRow = Db::one(
            'SELECT b.*, m.code AS materialCode, m.name AS materialName,'
            . ' m.specification AS materialSpecification, m.unit AS materialUnit'
            . ' FROM material_batches b LEFT JOIN materials m ON m.id = b.materialId WHERE b.batchNo = ?',
            array($batchNo),
            'material_batches'
        );
        $transactions = Db::all(
            'SELECT * FROM inventory_transactions WHERE batchNo = ? AND transactionType = ?'
            . ' ORDER BY transactionTime ASC',
            array($batchNo, 'out'),
            'inventory_transactions'
        );
        if ($batchRow === null && count($transactions) === 0) {
            throw new HttpException('未找到该批次，或该批次尚未发生出入库', 404);
        }

        $usageMap = array();
        foreach ($transactions as $transaction) {
            $key = $transaction['relatedOrder'] !== '' ? $transaction['relatedOrder'] : '-';
            if (isset($usageMap[$key])) {
                $usageMap[$key]['quantity'] += (float) $transaction['quantity'];
                $usageMap[$key]['transactionTime'] = $transaction['transactionTime'];
            } else {
                $usageMap[$key] = array(
                    'relatedOrder' => $key,
                    'quantity' => (float) $transaction['quantity'],
                    'transactionTime' => $transaction['transactionTime'],
                );
            }
        }

        $orderNos = array();
        foreach (array_keys($usageMap) as $orderNo) {
            if ($orderNo !== '-') {
                $orderNos[] = $orderNo;
            }
        }
        $orderIdMap = array();
        if (count($orderNos) > 0) {
            $placeholders = implode(',', array_fill(0, count($orderNos), '?'));
            $orders = Db::all(
                'SELECT id, orderNo FROM work_orders WHERE orderNo IN (' . $placeholders . ')',
                $orderNos
            );
            foreach ($orders as $order) {
                $orderIdMap[$order['orderNo']] = (int) $order['id'];
            }
        }

        $usages = array();
        foreach ($usageMap as $usage) {
            $usage['workOrderId'] = isset($orderIdMap[$usage['relatedOrder']])
                ? $orderIdMap[$usage['relatedOrder']] : null;
            $usages[] = $usage;
        }

        $batch = null;
        if ($batchRow !== null) {
            $batch = array(
                'id' => (int) $batchRow['id'],
                'materialId' => (int) $batchRow['materialId'],
                'batchNo' => $batchRow['batchNo'],
                'supplier' => $batchRow['supplier'],
                'receivedDate' => $batchRow['receivedDate'],
                'quantity' => (float) $batchRow['quantity'],
                'status' => $batchRow['status'],
                'createdAt' => $batchRow['createdAt'],
                'updatedAt' => $batchRow['updatedAt'],
                'material' => array(
                    'id' => (int) $batchRow['materialId'],
                    'code' => $batchRow['materialCode'],
                    'name' => $batchRow['materialName'],
                    'specification' => $batchRow['materialSpecification'],
                    'unit' => $batchRow['materialUnit'],
                ),
            );
        }

        Http::ok(array('batch' => $batch, 'usages' => $usages), '正向追溯查询成功');
    }

    /**
     * GET /api/materials/trace/backward
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function backwardTrace($params)
    {
        $workOrderNo = Http::query('workOrderNo');
        if ($workOrderNo === null || trim($workOrderNo) === '') {
            throw new HttpException('参数校验失败', 400, array(
                array('field' => 'workOrderNo', 'message' => '工单号不能为空'),
            ));
        }
        $workOrderNo = trim($workOrderNo);

        if ((int) Db::val('SELECT COUNT(*) FROM work_orders WHERE orderNo = ?', array($workOrderNo)) === 0) {
            throw new HttpException('未找到工单：' . $workOrderNo, 404);
        }

        $batchNos = array();
        $rows = Db::all(
            'SELECT DISTINCT batchNo FROM inventory_transactions WHERE relatedOrder = ? AND transactionType = ?',
            array($workOrderNo, 'out')
        );
        foreach ($rows as $row) {
            if ($row['batchNo'] !== '') {
                $batchNos[] = $row['batchNo'];
            }
        }

        $batches = array();
        if (count($batchNos) > 0) {
            $placeholders = implode(',', array_fill(0, count($batchNos), '?'));
            $rows = Db::all(
                'SELECT b.*, m.code AS materialCode, m.name AS materialName'
                . ' FROM material_batches b LEFT JOIN materials m ON m.id = b.materialId'
                . ' WHERE b.batchNo IN (' . $placeholders . ')',
                $batchNos,
                'material_batches'
            );
            foreach ($rows as $row) {
                $batches[] = array(
                    'batchNo' => $row['batchNo'],
                    'materialCode' => $row['materialCode'] === null ? '-' : $row['materialCode'],
                    'materialName' => $row['materialName'] === null ? '-' : $row['materialName'],
                    'supplier' => $row['supplier'],
                    'receivedDate' => $row['receivedDate'],
                    'quantity' => (float) $row['quantity'],
                );
            }
        }

        Http::ok(array('batches' => $batches), '反向追溯查询成功');
    }
}
