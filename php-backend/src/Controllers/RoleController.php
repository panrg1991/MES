<?php
/**
 * MES 系统 - 角色权限接口
 */

class RoleController
{
    const ADMIN_ROLE_CODE = 'system:admin';

    /**
     * GET /api/roles
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function index($params)
    {
        list($page, $pageSize) = Http::pagination();
        $keyword = Http::query('keyword');

        $where = '';
        $bind = array();
        if ($keyword !== null && $keyword !== '') {
            $where = ' WHERE (name LIKE ? OR code LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
        }

        $total = (int) Db::val('SELECT COUNT(*) FROM roles' . $where, $bind);
        $rows = Db::all(
            'SELECT id, name, code, description, status, createdAt, updatedAt,'
            . ' (SELECT COUNT(*) FROM user_roles ur WHERE ur.roleId = roles.id) AS userCount,'
            . ' (SELECT COUNT(*) FROM role_permissions rp WHERE rp.roleId = roles.id) AS permissionCount'
            . ' FROM roles' . $where . ' ORDER BY createdAt DESC LIMIT ' . $pageSize
            . ' OFFSET ' . (($page - 1) * $pageSize),
            $bind,
            'roles'
        );

        $list = array();
        foreach ($rows as $row) {
            $list[] = array(
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'code' => $row['code'],
                'description' => $row['description'],
                'status' => (bool) $row['status'],
                'createdAt' => $row['createdAt'],
                'updatedAt' => $row['updatedAt'],
                'userCount' => (int) $row['userCount'],
                'permissionCount' => (int) $row['permissionCount'],
            );
        }

        Http::paginated($list, $total, $page, $pageSize);
    }

    /**
     * 读取角色详情（含权限）
     * @param int $id 角色 ID
     * @return array<string,mixed>
     */
    public static function detail($id)
    {
        $role = Db::one(
            'SELECT id, name, code, description, status, createdAt, updatedAt FROM roles WHERE id = ?',
            array($id),
            'roles'
        );
        if ($role === null) {
            throw new HttpException('角色不存在', 404);
        }

        $permissions = Db::all(
            'SELECT p.id, p.name, p.code, p.type, p.parentId, p.path, p.sort'
            . ' FROM permissions p INNER JOIN role_permissions rp ON rp.permissionId = p.id'
            . ' WHERE rp.roleId = ? ORDER BY p.sort ASC, p.id ASC',
            array($id)
        );
        foreach ($permissions as $index => $permission) {
            $permissions[$index] = array(
                'id' => (int) $permission['id'],
                'name' => $permission['name'],
                'code' => $permission['code'],
                'type' => $permission['type'],
                'parentId' => $permission['parentId'] === null ? null : (int) $permission['parentId'],
                'path' => $permission['path'],
                'sort' => (int) $permission['sort'],
            );
        }

        return array(
            'id' => (int) $role['id'],
            'name' => $role['name'],
            'code' => $role['code'],
            'description' => $role['description'],
            'status' => (bool) $role['status'],
            'createdAt' => $role['createdAt'],
            'updatedAt' => $role['updatedAt'],
            'permissions' => $permissions,
        );
    }

    /**
     * GET /api/roles/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function show($params)
    {
        Http::ok(self::detail((int) $params['id']));
    }

    /**
     * POST /api/roles
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function store($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'name' => 'required|string|min:1|max:50',
            'code' => 'required|string|min:1|max:50',
            'description' => 'string|max:200',
        ));

        $code = trim((string) $body['code']);
        if (Db::val('SELECT COUNT(*) FROM roles WHERE code = ?', array($code)) > 0) {
            throw new HttpException('角色编码已存在', 409);
        }

        $now = Db::nowParam();
        $id = Db::insert('roles', array(
            'name' => trim((string) $body['name']),
            'code' => $code,
            'description' => isset($body['description']) ? (string) $body['description'] : '',
            'status' => 1,
            'createdAt' => $now,
            'updatedAt' => $now,
        ));

        Http::created(self::detail((int) $id));
    }

    /**
     * PUT /api/roles/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function update($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'name' => 'string|min:1|max:50',
            'description' => 'string|max:200',
            'status' => 'bool',
        ));

        $existing = Db::one('SELECT id, code FROM roles WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('角色不存在', 404);
        }

        if ($existing['code'] === self::ADMIN_ROLE_CODE
            && array_key_exists('status', $body)
            && !filter_var($body['status'], FILTER_VALIDATE_BOOLEAN)) {
            throw new HttpException('不允许停用系统管理员角色', 403);
        }

        $data = array('updatedAt' => Db::nowParam());
        if (array_key_exists('name', $body)) {
            $data['name'] = $body['name'];
        }
        if (array_key_exists('description', $body)) {
            $data['description'] = $body['description'];
        }
        if (array_key_exists('status', $body)) {
            $data['status'] = filter_var($body['status'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        }

        Db::update('roles', $data, 'id = ?', array($id));
        Http::ok(self::detail($id), '更新成功');
    }

    /**
     * DELETE /api/roles/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function destroy($params)
    {
        $id = (int) $params['id'];
        $existing = Db::one('SELECT id, code FROM roles WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('角色不存在', 404);
        }
        if ($existing['code'] === self::ADMIN_ROLE_CODE) {
            throw new HttpException('不允许删除系统管理员角色', 403);
        }

        $userCount = (int) Db::val('SELECT COUNT(*) FROM user_roles WHERE roleId = ?', array($id));
        if ($userCount > 0) {
            throw new HttpException('该角色下还有 ' . $userCount . ' 个用户，无法删除', 409);
        }

        Db::tx(function () use ($id) {
            Db::exec('DELETE FROM role_permissions WHERE roleId = ?', array($id));
            Db::exec('DELETE FROM roles WHERE id = ?', array($id));
            return null;
        });

        Http::ok(null, '删除成功');
    }

    /**
     * GET /api/roles/:id/permissions
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function permissions($params)
    {
        $id = (int) $params['id'];
        $exists = Db::val('SELECT COUNT(*) FROM roles WHERE id = ?', array($id));
        if ((int) $exists === 0) {
            throw new HttpException('角色不存在', 404);
        }
        $rows = Db::all(
            'SELECT permissionId FROM role_permissions WHERE roleId = ? ORDER BY permissionId ASC',
            array($id)
        );
        $ids = array();
        foreach ($rows as $row) {
            $ids[] = (int) $row['permissionId'];
        }
        Http::ok($ids);
    }

    /**
     * PUT /api/roles/:id/permissions
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function assignPermissions($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array('permissionIds' => 'required'));

        $existing = Db::one('SELECT id, code FROM roles WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('角色不存在', 404);
        }
        if ($existing['code'] === self::ADMIN_ROLE_CODE) {
            throw new HttpException('不允许修改系统管理员角色的权限', 403);
        }

        $permissionIds = is_array($body['permissionIds'])
            ? array_values(array_unique(array_map('intval', $body['permissionIds'])))
            : array();

        if (count($permissionIds) > 0) {
            $placeholders = implode(',', array_fill(0, count($permissionIds), '?'));
            $count = (int) Db::val(
                'SELECT COUNT(*) FROM permissions WHERE id IN (' . $placeholders . ')',
                $permissionIds
            );
            if ($count !== count($permissionIds)) {
                throw new HttpException('部分权限不存在', 400);
            }
        }

        Db::tx(function () use ($id, $permissionIds) {
            Db::exec('DELETE FROM role_permissions WHERE roleId = ?', array($id));
            foreach ($permissionIds as $permissionId) {
                Db::insert('role_permissions', array(
                    'roleId' => $id,
                    'permissionId' => $permissionId,
                ));
            }
            return null;
        });

        Http::ok(null, '权限分配成功');
    }

    /**
     * GET /api/permissions
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function allPermissions($params)
    {
        $rows = Db::all(
            'SELECT id, name, code, type, parentId, path, sort FROM permissions ORDER BY sort ASC, id ASC'
        );
        $list = array();
        foreach ($rows as $row) {
            $list[] = array(
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'code' => $row['code'],
                'type' => $row['type'],
                'parentId' => $row['parentId'] === null ? null : (int) $row['parentId'],
                'path' => $row['path'],
                'sort' => (int) $row['sort'],
            );
        }
        Http::ok(self::buildTree($list, null));
    }

    /**
     * 递归构建权限树
     * @param array<int,array<string,mixed>> $permissions 全部权限
     * @param int|null $parentId 父级
     * @return array<int,array<string,mixed>>
     */
    private static function buildTree($permissions, $parentId)
    {
        $tree = array();
        foreach ($permissions as $permission) {
            if ($permission['parentId'] !== $parentId) {
                continue;
            }
            $tree[] = array(
                'id' => $permission['id'],
                'name' => $permission['name'],
                'code' => $permission['code'],
                'type' => $permission['type'],
                'path' => $permission['path'],
                'sort' => $permission['sort'],
                'children' => self::buildTree($permissions, $permission['id']),
            );
        }
        return $tree;
    }
}
