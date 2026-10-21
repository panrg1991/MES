<?php
/**
 * MES 系统 - 用户管理接口
 */

class UserController
{
    const ADMIN_ROLE_CODE = 'system:admin';

    /**
     * 用户是否持有管理员角色
     * @param int $userId 用户 ID
     * @return bool
     */
    private static function hasAdminRole($userId)
    {
        $count = Db::val(
            'SELECT COUNT(*) FROM user_roles ur INNER JOIN roles r ON r.id = ur.roleId'
            . ' WHERE ur.userId = ? AND r.code = ?',
            array($userId, self::ADMIN_ROLE_CODE)
        );
        return (int) $count > 0;
    }

    /**
     * 除指定用户外的启用管理员数量
     * @param int $excludeUserId 排除的用户
     * @return int
     */
    private static function countOtherActiveAdmins($excludeUserId)
    {
        return (int) Db::val(
            'SELECT COUNT(*) FROM users u'
            . ' INNER JOIN user_roles ur ON ur.userId = u.id'
            . ' INNER JOIN roles r ON r.id = ur.roleId'
            . ' WHERE u.status = 1 AND u.id <> ? AND r.code = ?',
            array($excludeUserId, self::ADMIN_ROLE_CODE)
        );
    }

    /**
     * 批量读取用户角色
     * @param array<int,int> $userIds 用户 ID 列表
     * @return array<int,array<int,array<string,mixed>>>
     */
    private static function rolesMap($userIds)
    {
        $map = array();
        if (count($userIds) === 0) {
            return $map;
        }
        $placeholders = implode(',', array_fill(0, count($userIds), '?'));
        $rows = Db::all(
            'SELECT ur.userId AS userId, r.id AS id, r.name AS name, r.code AS code, r.description AS description'
            . ' FROM user_roles ur INNER JOIN roles r ON r.id = ur.roleId'
            . ' WHERE ur.userId IN (' . $placeholders . ') ORDER BY r.id ASC',
            $userIds
        );
        foreach ($rows as $row) {
            $userId = (int) $row['userId'];
            if (!isset($map[$userId])) {
                $map[$userId] = array();
            }
            $map[$userId][] = array(
                'id' => (int) $row['id'],
                'name' => $row['name'],
                'code' => $row['code'],
            );
        }
        return $map;
    }

    /**
     * 格式化用户（含角色）
     * @param array<string,mixed> $row 用户行
     * @param array<int,array<string,mixed>> $roles 角色
     * @return array<string,mixed>
     */
    private static function formatUser($row, $roles)
    {
        return array(
            'id' => (int) $row['id'],
            'username' => $row['username'],
            'name' => $row['name'],
            'department' => $row['department'],
            'status' => (bool) $row['status'],
            'createdAt' => $row['createdAt'],
            'updatedAt' => $row['updatedAt'],
            'roles' => $roles,
        );
    }

    /**
     * 读取用户详情（含角色）
     * @param int $id 用户 ID
     * @return array<string,mixed>
     */
    public static function detail($id)
    {
        $row = Db::one(
            'SELECT id, username, name, department, status, createdAt, updatedAt FROM users WHERE id = ?',
            array($id),
            'users'
        );
        if ($row === null) {
            throw new HttpException('用户不存在', 404);
        }
        $map = self::rolesMap(array($id));
        return self::formatUser($row, isset($map[$id]) ? $map[$id] : array());
    }

    /**
     * GET /api/users
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function index($params)
    {
        list($page, $pageSize) = Http::pagination();
        $keyword = Http::query('keyword');
        $status = Http::query('status');
        Validate::queryEnum('status', array('true', 'false'));

        $where = array();
        $bind = array();
        if ($keyword !== null && $keyword !== '') {
            $where[] = '(username LIKE ? OR name LIKE ? OR department LIKE ?)';
            $like = '%' . $keyword . '%';
            $bind[] = $like;
            $bind[] = $like;
            $bind[] = $like;
        }
        if ($status !== null) {
            $where[] = 'status = ?';
            $bind[] = $status === 'true' ? 1 : 0;
        }
        $whereSql = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';

        $total = (int) Db::val('SELECT COUNT(*) FROM users' . $whereSql, $bind);
        $rows = Db::all(
            'SELECT id, username, name, department, status, createdAt, updatedAt FROM users'
            . $whereSql . ' ORDER BY createdAt DESC LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize),
            $bind,
            'users'
        );

        $ids = array();
        foreach ($rows as $row) {
            $ids[] = (int) $row['id'];
        }
        $map = self::rolesMap($ids);
        $list = array();
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $list[] = self::formatUser($row, isset($map[$id]) ? $map[$id] : array());
        }

        Http::paginated($list, $total, $page, $pageSize);
    }

    /**
     * GET /api/users/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function show($params)
    {
        Http::ok(self::detail((int) $params['id']));
    }

    /**
     * POST /api/users
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function store($params)
    {
        $body = Http::body();
        Validate::run($body, array(
            'username' => 'required|string|min:2|max:50',
            'name' => 'required|string|min:1|max:50',
            'department' => 'required|string|min:1|max:100',
            'password' => 'required|string|min:6|max:100',
            'roleIds' => 'required|array',
        ));

        $username = trim((string) $body['username']);
        if (Db::val('SELECT COUNT(*) FROM users WHERE username = ?', array($username)) > 0) {
            throw new HttpException('用户名已存在', 409);
        }

        $roleIds = array_values(array_unique(array_map('intval', $body['roleIds'])));
        $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
        $existingRoles = (int) Db::val(
            'SELECT COUNT(*) FROM roles WHERE id IN (' . $placeholders . ')',
            $roleIds
        );
        if ($existingRoles !== count($roleIds)) {
            throw new HttpException('部分角色不存在', 400);
        }

        $now = Db::nowParam();
        $userId = Db::tx(function () use ($body, $username, $roleIds, $now) {
            $id = Db::insert('users', array(
                'username' => $username,
                'passwordHash' => Auth::hashPassword((string) $body['password']),
                'name' => trim((string) $body['name']),
                'department' => trim((string) $body['department']),
                'status' => 1,
                'createdAt' => $now,
                'updatedAt' => $now,
            ));
            foreach ($roleIds as $roleId) {
                Db::insert('user_roles', array('userId' => $id, 'roleId' => $roleId));
            }
            return $id;
        });

        Http::created(self::detail((int) $userId));
    }

    /**
     * PUT /api/users/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function update($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array(
            'name' => 'string|min:1|max:50',
            'department' => 'string|min:1|max:100',
            'roleIds' => 'array',
        ));

        $existing = Db::one('SELECT id FROM users WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('用户不存在', 404);
        }

        $roleIds = null;
        if (array_key_exists('roleIds', $body)) {
            $roleIds = array_values(array_unique(array_map('intval', (array) $body['roleIds'])));
            if (count($roleIds) === 0) {
                throw new HttpException('至少需要为用户保留一个角色', 400);
            }
            $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
            $count = (int) Db::val('SELECT COUNT(*) FROM roles WHERE id IN (' . $placeholders . ')', $roleIds);
            if ($count !== count($roleIds)) {
                throw new HttpException('部分角色不存在', 400);
            }

            if (self::hasAdminRole($id)) {
                $adminRoleId = Db::val('SELECT id FROM roles WHERE code = ?', array(self::ADMIN_ROLE_CODE));
                $stillAdmin = $adminRoleId !== null && in_array((int) $adminRoleId, $roleIds, true);
                if (!$stillAdmin && self::countOtherActiveAdmins($id) === 0) {
                    throw new HttpException('不能移除系统中最后一个管理员的角色', 403);
                }
            }
        }

        $now = Db::nowParam();
        Db::tx(function () use ($id, $body, $roleIds, $now) {
            $data = array('updatedAt' => $now);
            if (array_key_exists('name', $body)) {
                $data['name'] = $body['name'];
            }
            if (array_key_exists('department', $body)) {
                $data['department'] = $body['department'];
            }
            Db::update('users', $data, 'id = ?', array($id));

            if ($roleIds !== null) {
                Db::exec('DELETE FROM user_roles WHERE userId = ?', array($id));
                foreach ($roleIds as $roleId) {
                    Db::insert('user_roles', array('userId' => $id, 'roleId' => $roleId));
                }
            }
            return null;
        });

        Http::ok(self::detail($id), '更新成功');
    }

    /**
     * PATCH /api/users/:id/status
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function toggleStatus($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array('status' => 'required|bool'));

        $existing = Db::one('SELECT id FROM users WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('用户不存在', 404);
        }

        $status = filter_var($body['status'], FILTER_VALIDATE_BOOLEAN);
        if (!$status) {
            $current = Auth::user();
            if ((int) $current['userId'] === $id) {
                throw new HttpException('不能停用当前登录账号', 403);
            }
            if (self::hasAdminRole($id) && self::countOtherActiveAdmins($id) === 0) {
                throw new HttpException('不能停用系统中最后一个管理员账号', 403);
            }
        }

        Db::update(
            'users',
            array('status' => $status ? 1 : 0, 'updatedAt' => Db::nowParam()),
            'id = ?',
            array($id)
        );
        Http::ok(self::detail($id), '状态更新成功');
    }

    /**
     * PATCH /api/users/:id/password
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function resetPassword($params)
    {
        $id = (int) $params['id'];
        $body = Http::body();
        Validate::run($body, array('newPassword' => 'required|string|min:6|max:100'));

        $existing = Db::one('SELECT id FROM users WHERE id = ?', array($id));
        if ($existing === null) {
            throw new HttpException('用户不存在', 404);
        }

        Db::update(
            'users',
            array(
                'passwordHash' => Auth::hashPassword((string) $body['newPassword']),
                'updatedAt' => Db::nowParam(),
            ),
            'id = ?',
            array($id)
        );
        Http::ok(null, '密码重置成功');
    }

    /**
     * DELETE /api/users/:id
     * @param array<string,mixed> $params 路径参数
     * @return void
     */
    public static function destroy($params)
    {
        $id = (int) $params['id'];
        $existing = Db::one(
            'SELECT id, username FROM users WHERE id = ?',
            array($id)
        );
        if ($existing === null) {
            throw new HttpException('用户不存在', 404);
        }

        $current = Auth::user();
        if ((int) $current['userId'] === $id) {
            throw new HttpException('不能删除当前登录账号', 403);
        }
        if ($existing['username'] === 'admin') {
            throw new HttpException('不允许删除系统内置管理员账号', 403);
        }
        if (self::hasAdminRole($id) && self::countOtherActiveAdmins($id) === 0) {
            throw new HttpException('不允许删除系统中最后一个管理员账号', 403);
        }

        Db::tx(function () use ($id) {
            Db::exec('DELETE FROM user_roles WHERE userId = ?', array($id));
            Db::exec('DELETE FROM users WHERE id = ?', array($id));
            return null;
        });

        Http::ok(null, '删除成功');
    }
}
