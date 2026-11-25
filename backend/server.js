const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==========================================
// CONFIGURACIÓN DE BASE DE DATOS (MySQL)
// ==========================================
const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hotel_aloria',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

if (process.env.DB_SSL === 'true') {
    poolConfig.ssl = {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    };
}

const db = mysql.createPool(poolConfig);

db.getConnection()
    .then(conn => {
        conn.release();
        console.log('Conectado a la base de datos MySQL exitosamente.');
    })
    .catch(err => console.error('Error conectando a MySQL:', err.message));

// Healthcheck para monitoreo y despliegue PaaS
app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

// ==========================================
// 1. RUTA DE AUTENTICACIÓN (LOGIN)
// ==========================================
app.post('/api/login', async (req, res) => {
    const { correo, password } = req.body;
    if (!correo || !password) {
        return res.status(400).json({ error: 'Ingresa correo y contraseña' });
    }

    try {
        const query = 'SELECT id_empleado, nombre, apellido, rol, password_hash FROM Empleados WHERE correo = ?';
        const [results] = await db.query(query, [correo]);

        if (results.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const usuario = results[0];
        const coincide = await bcrypt.compare(password, usuario.password_hash);

        if (!coincide) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        res.json({
            success: true,
            rol: usuario.rol,
            nombre: usuario.nombre,
            apellido: usuario.apellido
        });
    } catch (error) {
        console.error('Error en /api/login:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ==========================================
// 2. RUTAS DE RECEPCIÓN (HABITACIONES, PAQUETES, CHECK-IN, CHECK-OUT)
// ==========================================
app.get('/api/habitaciones', async (req, res) => {
    try {
        const query = `
            SELECT h.id_habitacion, h.numero, h.piso, h.tipo, h.categoria, h.tarifa_base, e.nombre_estado AS estado
            FROM Habitaciones h
            JOIN Estado_Habitacion e ON h.id_estado = e.id_estado
            ORDER BY h.numero ASC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error en /api/habitaciones:', error);
        res.status(500).json({ error: 'Error obteniendo habitaciones' });
    }
});

app.get('/api/habitaciones/disponibles', async (req, res) => {
    const { fecha_inicio, fecha_fin } = req.query;

    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'Se requieren fecha_inicio y fecha_fin' });
    }

    if (fecha_fin <= fecha_inicio) {
        return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la fecha de entrada' });
    }

    try {
        const query = `
            SELECT h.id_habitacion, h.numero, h.piso, h.tipo, h.categoria, h.tarifa_base, e.nombre_estado AS estado
            FROM Habitaciones h
            JOIN Estado_Habitacion e ON h.id_estado = e.id_estado
            WHERE e.nombre_estado != 'Mantenimiento'
              AND h.id_habitacion NOT IN (
                  SELECT r.id_habitacion
                  FROM Reservaciones r
                  WHERE r.estado IN ('Confirmada', 'En curso')
                    AND r.fecha_inicio < ?
                    AND r.fecha_fin > ?
              )
            ORDER BY h.numero ASC
        `;
        const [rows] = await db.query(query, [fecha_fin, fecha_inicio]);
        res.json(rows);
    } catch (error) {
        console.error('Error en /api/habitaciones/disponibles:', error);
        res.status(500).json({ error: 'Error consultando disponibilidad de habitaciones' });
    }
});

app.patch('/api/habitaciones/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosPermitidos = {
        'Disponible': 1,
        'En Limpieza': 3,
        'Mantenimiento': 4
    };

    if (!estadosPermitidos[estado]) {
        return res.status(400).json({ error: 'Estado no válido para cambio manual' });
    }

    try {
        const [rows] = await db.query(
            `SELECT h.id_habitacion, e.nombre_estado AS estado
             FROM Habitaciones h
             JOIN Estado_Habitacion e ON h.id_estado = e.id_estado
             WHERE h.id_habitacion = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Habitación no encontrada' });
        }

        if (rows[0].estado === 'Ocupada') {
            return res.status(409).json({ error: 'La habitación está Ocupada. Procesa el Check-Out primero.' });
        }

        await db.query('UPDATE Habitaciones SET id_estado = ? WHERE id_habitacion = ?', [estadosPermitidos[estado], id]);
        res.json({ message: `Habitación actualizada a ${estado}` });
    } catch (error) {
        console.error('Error en PATCH /api/habitaciones/:id/estado:', error);
        res.status(500).json({ error: 'Error actualizando estado de habitación' });
    }
});

app.get('/api/paquetes', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id_paquete, tipo_servicio, precio, promocion FROM Paquetes ORDER BY precio ASC'
        );
        res.json(rows);
    } catch (error) {
        console.error('Error en /api/paquetes:', error);
        res.status(500).json({ error: 'Error obteniendo paquetes' });
    }
});

// ==========================================
// 3. RUTAS DE RESERVACIONES Y CALENDARIO
// ==========================================
app.get('/api/reservaciones', async (req, res) => {
    try {
        const query = `
            SELECT
                r.id_reservacion,
                DATE_FORMAT(r.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(r.fecha_fin, '%Y-%m-%d') AS fecha_fin,
                r.num_huespedes,
                r.estado,
                r.id_habitacion,
                h.numero AS numero_habitacion,
                h.tipo AS tipo_habitacion,
                h.categoria AS categoria_habitacion,
                h.tarifa_base,
                e.nombre_estado AS estado_habitacion,
                hu.id_huesped,
                hu.ine,
                hu.nombre AS nombre_huesped,
                hu.apellido AS apellido_huesped,
                hu.telefono AS telefono_huesped,
                p.id_paquete,
                p.tipo_servicio AS paquete,
                COALESCE(p.precio, 0) AS precio_paquete,
                ((DATEDIFF(r.fecha_fin, r.fecha_inicio) * h.tarifa_base) + COALESCE(p.precio, 0)) AS total_estimado
            FROM Reservaciones r
            JOIN Huespedes hu ON r.id_huesped = hu.id_huesped
            JOIN Habitaciones h ON r.id_habitacion = h.id_habitacion
            JOIN Estado_Habitacion e ON h.id_estado = e.id_estado
            LEFT JOIN Paquetes p ON r.id_paquete = p.id_paquete
            ORDER BY r.fecha_inicio DESC, r.id_reservacion DESC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error en GET /api/reservaciones:', error);
        res.status(500).json({ error: 'Error obteniendo reservaciones' });
    }
});

app.post('/api/reservaciones', async (req, res) => {
    const {
        ine,
        nombre,
        apellido,
        telefono,
        id_habitacion,
        id_paquete,
        fecha_inicio,
        fecha_fin,
        num_huespedes
    } = req.body;

    if (!ine || !nombre || !apellido || !id_habitacion || !fecha_inicio || !fecha_fin) {
        return res.status(400).json({ error: 'Todos los campos obligatorios deben completarse' });
    }

    if (fecha_fin <= fecha_inicio) {
        return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la fecha de entrada' });
    }

    const huespedesCount = Number(num_huespedes || 1);
    if (!Number.isInteger(huespedesCount) || huespedesCount < 1) {
        return res.status(400).json({ error: 'El número de huéspedes debe ser al menos 1' });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Validar habitación existente y operativa
        const [habitaciones] = await connection.query(
            `SELECT h.id_habitacion, h.numero, e.nombre_estado AS estado
             FROM Habitaciones h
             JOIN Estado_Habitacion e ON h.id_estado = e.id_estado
             WHERE h.id_habitacion = ? FOR UPDATE`,
            [id_habitacion]
        );

        if (habitaciones.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Habitación no encontrada' });
        }

        if (habitaciones[0].estado === 'Mantenimiento') {
            await connection.rollback();
            return res.status(409).json({ error: `La habitación ${habitaciones[0].numero} se encuentra en mantenimiento.` });
        }

        // Validar empalme de fechas con reservaciones Confirmadas o En curso
        const [empalmes] = await connection.query(
            `SELECT id_reservacion
             FROM Reservaciones
             WHERE id_habitacion = ?
               AND estado IN ('Confirmada', 'En curso')
               AND fecha_inicio < ?
               AND fecha_fin > ?
             FOR UPDATE`,
            [id_habitacion, fecha_fin, fecha_inicio]
        );

        if (empalmes.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                error: `La habitación ${habitaciones[0].numero} ya tiene una reservación activa en ese rango de fechas.`
            });
        }

        // Validar paquete opcional si se envía
        const paqueteId = id_paquete ? Number(id_paquete) : null;
        if (paqueteId) {
            const [paquetes] = await connection.query(
                'SELECT id_paquete FROM Paquetes WHERE id_paquete = ?',
                [paqueteId]
            );
            if (paquetes.length === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'El paquete seleccionado no existe' });
            }
        }

        // Buscar o registrar huésped por INE
        const ineLimpio = String(ine).trim();
        const [huespedes] = await connection.query(
            'SELECT id_huesped FROM Huespedes WHERE ine = ? FOR UPDATE',
            [ineLimpio]
        );

        let id_huesped;
        if (huespedes.length > 0) {
            id_huesped = huespedes[0].id_huesped;
        } else {
            const [nuevoHuesped] = await connection.query(
                'INSERT INTO Huespedes (ine, nombre, apellido, telefono) VALUES (?, ?, ?, ?)',
                [ineLimpio, String(nombre).trim(), String(apellido).trim(), telefono ? String(telefono).trim() : null]
            );
            id_huesped = nuevoHuesped.insertId;
        }

        const [nuevaReserva] = await connection.query(
            `INSERT INTO Reservaciones (id_huesped, id_habitacion, id_paquete, fecha_inicio, fecha_fin, num_huespedes, estado)
             VALUES (?, ?, ?, ?, ?, ?, 'Confirmada')`,
            [id_huesped, id_habitacion, paqueteId, fecha_inicio, fecha_fin, huespedesCount]
        );

        await connection.commit();
        res.status(201).json({
            message: 'Reservación agendada con éxito',
            id_reservacion: nuevaReserva.insertId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error en POST /api/reservaciones:', error);
        res.status(500).json({ error: 'Error interno al agendar la reservación' });
    } finally {
        connection.release();
    }
});

app.post('/api/reservaciones/:id/checkin', async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [reservas] = await connection.query(
            'SELECT id_reservacion, id_habitacion, estado FROM Reservaciones WHERE id_reservacion = ? FOR UPDATE',
            [id]
        );

        if (reservas.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Reservación no encontrada' });
        }

        const reserva = reservas[0];
        if (reserva.estado !== 'Confirmada') {
            await connection.rollback();
            return res.status(400).json({ error: `No se puede hacer Check-In: la reservación está en estado '${reserva.estado}'.` });
        }

        const [habitaciones] = await connection.query(
            `SELECT h.id_habitacion, h.numero, e.nombre_estado AS estado
             FROM Habitaciones h
             JOIN Estado_Habitacion e ON h.id_estado = e.id_estado
             WHERE h.id_habitacion = ? FOR UPDATE`,
            [reserva.id_habitacion]
        );

        if (habitaciones.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Habitación asociada no encontrada' });
        }

        const hab = habitaciones[0];
        if (hab.estado === 'Ocupada') {
            await connection.rollback();
            return res.status(409).json({ error: `La habitación ${hab.numero} está Ocupada. Realiza el Check-Out primero.` });
        }
        if (hab.estado === 'Mantenimiento') {
            await connection.rollback();
            return res.status(409).json({ error: `La habitación ${hab.numero} se encuentra en Mantenimiento.` });
        }
        if (hab.estado === 'En Limpieza') {
            await connection.rollback();
            return res.status(409).json({ error: `La habitación ${hab.numero} está En Limpieza. Márcala como Disponible antes del Check-In.` });
        }

        const [otrasEnCurso] = await connection.query(
            `SELECT id_reservacion FROM Reservaciones
             WHERE id_habitacion = ? AND estado = 'En curso' AND id_reservacion != ? FOR UPDATE`,
            [reserva.id_habitacion, id]
        );

        if (otrasEnCurso.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: `La habitación ${hab.numero} ya tiene otra estancia en curso.` });
        }

        await connection.query(
            `UPDATE Reservaciones SET estado = 'En curso' WHERE id_reservacion = ?`,
            [id]
        );

        await connection.query(
            'UPDATE Habitaciones SET id_estado = 2 WHERE id_habitacion = ?',
            [reserva.id_habitacion]
        );

        await connection.commit();
        res.status(200).json({ message: `Check-In completado para la habitación ${hab.numero}` });
    } catch (error) {
        await connection.rollback();
        console.error('Error en POST /api/reservaciones/:id/checkin:', error);
        res.status(500).json({ error: 'Error interno al procesar el Check-In de la reservación' });
    } finally {
        connection.release();
    }
});

app.post('/api/reservaciones/:id/cancelar', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query(
            `UPDATE Reservaciones SET estado = 'Cancelada' WHERE id_reservacion = ? AND estado = 'Confirmada'`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'Solo se pueden cancelar reservaciones en estado Confirmada' });
        }

        res.json({ message: 'Reservación cancelada exitosamente' });
    } catch (error) {
        console.error('Error en POST /api/reservaciones/:id/cancelar:', error);
        res.status(500).json({ error: 'Error al cancelar la reservación' });
    }
});

// Check-In directo (Walk-In) - Preserva compatibilidad total con /api/checkin
app.post('/api/checkin', async (req, res) => {
    const { ine, nombre, apellido, telefono, id_habitacion, num_huespedes, id_paquete, fecha_fin } = req.body;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [habitaciones] = await connection.query(
            `SELECT h.id_habitacion, h.numero, e.nombre_estado AS estado
             FROM Habitaciones h
             JOIN Estado_Habitacion e ON h.id_estado = e.id_estado
             WHERE h.id_habitacion = ? FOR UPDATE`,
            [id_habitacion]
        );

        if (habitaciones.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Habitación no encontrada' });
        }

        if (habitaciones[0].estado !== 'Disponible') {
            await connection.rollback();
            return res.status(409).json({ error: `La habitación ${habitaciones[0].numero} no está Disponible (${habitaciones[0].estado}).` });
        }

        // Verificar huésped
        const [huespedes] = await connection.query('SELECT id_huesped FROM Huespedes WHERE ine = ? FOR UPDATE', [ine]);
        let id_huesped;

        if (huespedes.length > 0) {
            id_huesped = huespedes[0].id_huesped;
        } else {
            const [nuevoHuesped] = await connection.query(
                'INSERT INTO Huespedes (ine, nombre, apellido, telefono) VALUES (?, ?, ?, ?)',
                [ine, nombre, apellido, telefono || null]
            );
            id_huesped = nuevoHuesped.insertId;
        }

        const huespedesCount = Number(num_huespedes || 1);
        const paqueteId = id_paquete ? Number(id_paquete) : null;

        if (fecha_fin) {
            await connection.query(
                `INSERT INTO Reservaciones (id_huesped, id_habitacion, id_paquete, fecha_inicio, fecha_fin, num_huespedes, estado)
                 VALUES (?, ?, ?, CURDATE(), ?, ?, 'En curso')`,
                [id_huesped, id_habitacion, paqueteId, fecha_fin, huespedesCount]
            );
        } else {
            await connection.query(
                `INSERT INTO Reservaciones (id_huesped, id_habitacion, id_paquete, fecha_inicio, fecha_fin, num_huespedes, estado)
                 VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY), ?, 'En curso')`,
                [id_huesped, id_habitacion, paqueteId, huespedesCount]
            );
        }

        await connection.query(
            'UPDATE Habitaciones SET id_estado = 2 WHERE id_habitacion = ?',
            [id_habitacion]
        );

        await connection.commit();
        res.status(200).json({ message: 'Check-in realizado con éxito' });
    } catch (error) {
        await connection.rollback();
        console.error('Error en POST /api/checkin:', error);
        res.status(500).json({ error: 'Error interno al procesar el Check-In' });
    } finally {
        connection.release();
    }
});

app.post('/api/checkout', async (req, res) => {
    const { id_habitacion } = req.body;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(
            `UPDATE Reservaciones SET estado = 'Finalizada' WHERE id_habitacion = ? AND estado = 'En curso'`,
            [id_habitacion]
        );

        // Cambiar estado de habitación a "En Limpieza" (id_estado = 3)
        await connection.query(
            'UPDATE Habitaciones SET id_estado = 3 WHERE id_habitacion = ?',
            [id_habitacion]
        );

        await connection.commit();
        res.status(200).json({ message: 'Check-Out completado. Habitación en limpieza.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error en POST /api/checkout:', error);
        res.status(500).json({ error: 'Error interno al procesar el Check-Out' });
    } finally {
        connection.release();
    }
});

// ==========================================
// 4. RUTAS GERENCIALES Y RECURSOS HUMANOS
// ==========================================
app.post('/api/empleados', async (req, res) => {
    const { nombre, apellido, correo, password, rol } = req.body;
    if (!nombre || !apellido || !correo || !password || !rol) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        const [nominaRows] = await db.query(
            'SELECT id_nomina FROM Nomina WHERE tipo_puesto = ? LIMIT 1',
            [rol]
        );
        let idNomina = nominaRows.length > 0 ? nominaRows[0].id_nomina : 1;
        if (nominaRows.length === 0) {
            if (rol === 'Gerencia') idNomina = 2;
            else if (rol === 'Recursos Humanos') idNomina = 3;
        }

        const query = `INSERT INTO Empleados (nombre, apellido, correo, id_nomina, password_hash, rol) 
                       VALUES (?, ?, ?, ?, ?, ?)`;

        await db.query(query, [nombre.trim(), apellido.trim(), correo.trim(), idNomina, passwordHash, rol]);
        res.status(201).json({ message: 'Trabajador registrado exitosamente' });
    } catch (error) {
        console.error('Error en POST /api/empleados:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe un empleado registrado con ese correo' });
        }
        res.status(500).json({ error: 'Error en el servidor al registrar' });
    }
});

app.put('/api/empleados/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, correo, rol, sueldo, password } = req.body;

    if (!nombre || !apellido || !correo || !rol) {
        return res.status(400).json({ error: 'Nombre, apellido, correo y rol son obligatorios' });
    }

    try {
        const [nominaRows] = await db.query(
            'SELECT id_nomina FROM Nomina WHERE tipo_puesto = ? LIMIT 1',
            [rol]
        );
        let idNomina = nominaRows.length > 0 ? nominaRows[0].id_nomina : 1;
        if (nominaRows.length === 0) {
            if (rol === 'Gerencia') idNomina = 2;
            else if (rol === 'Recursos Humanos') idNomina = 3;
        }

        // Actualizar tabulador salarial si se modificó el monto
        if (sueldo !== undefined && sueldo !== '' && !isNaN(Number(sueldo))) {
            await db.query(
                'UPDATE Nomina SET sueldo = ? WHERE id_nomina = ?',
                [Number(sueldo), idNomina]
            );
        }

        let result;
        if (password && String(password).trim() !== '') {
            const passwordHash = await bcrypt.hash(String(password).trim(), 10);
            [result] = await db.query(
                `UPDATE Empleados 
                 SET nombre = ?, apellido = ?, correo = ?, rol = ?, id_nomina = ?, password_hash = ?
                 WHERE id_empleado = ?`,
                [nombre.trim(), apellido.trim(), correo.trim(), rol, idNomina, passwordHash, id]
            );
        } else {
            [result] = await db.query(
                `UPDATE Empleados 
                 SET nombre = ?, apellido = ?, correo = ?, rol = ?, id_nomina = ?
                 WHERE id_empleado = ?`,
                [nombre.trim(), apellido.trim(), correo.trim(), rol, idNomina, id]
            );
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Colaborador no encontrado' });
        }

        res.json({ message: 'Información del colaborador actualizada correctamente' });
    } catch (error) {
        console.error('Error en PUT /api/empleados/:id:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ese correo corporativo ya pertenece a otro colaborador' });
        }
        res.status(500).json({ error: 'Error al actualizar la información del colaborador' });
    }
});

app.delete('/api/empleados/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.query('DELETE FROM Empleados WHERE id_empleado = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Colaborador no encontrado' });
        }
        res.json({ message: 'Colaborador dado de baja correctamente' });
    } catch (error) {
        console.error('Error en DELETE /api/empleados/:id:', error);
        res.status(500).json({ error: 'Error al eliminar el colaborador' });
    }
});

app.get('/api/nominas', async (req, res) => {
    try {
        const query = `
            SELECT e.id_empleado, e.nombre, e.apellido, e.correo, e.rol, n.sueldo 
            FROM Empleados e
            JOIN Nomina n ON e.id_nomina = n.id_nomina
            ORDER BY e.id_empleado ASC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error en GET /api/nominas:', error);
        res.status(500).json({ error: 'Error al consultar las nóminas' });
    }
});

app.get('/api/tabulador-nomina', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id_nomina, tipo_puesto, sueldo FROM Nomina ORDER BY id_nomina ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error en GET /api/tabulador-nomina:', error);
        res.status(500).json({ error: 'Error al consultar el tabulador de nómina' });
    }
});

app.get('/api/dashboard/ocupacion', async (req, res) => {
    try {
        const query = `
            SELECT e.nombre_estado AS estado, COUNT(h.id_habitacion) AS cantidad
            FROM Habitaciones h
            JOIN Estado_Habitacion e ON h.id_estado = e.id_estado
            GROUP BY e.nombre_estado
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/finanzas', async (req, res) => {
    try {
        const queryIngresos = `
            SELECT SUM((DATEDIFF(r.fecha_fin, r.fecha_inicio) * h.tarifa_base) + COALESCE(p.precio, 0)) AS total_ingresos
            FROM Reservaciones r
            JOIN Habitaciones h ON r.id_habitacion = h.id_habitacion
            LEFT JOIN Paquetes p ON r.id_paquete = p.id_paquete
            WHERE r.estado != 'Cancelada'
        `;
        const queryCostos = `SELECT SUM(monto) AS total_costos FROM Costos_Operacionales`;

        const [ingresos] = await db.query(queryIngresos);
        const [costos] = await db.query(queryCostos);

        res.json({
            ingresos: Number(ingresos[0].total_ingresos || 0),
            costos: Number(costos[0].total_costos || 0)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/paquetes', async (req, res) => {
    try {
        const query = `
            SELECT p.tipo_servicio AS paquete, COUNT(r.id_reservacion) AS cantidad_vendida
            FROM Reservaciones r
            JOIN Paquetes p ON r.id_paquete = p.id_paquete
            WHERE r.estado != 'Cancelada'
            GROUP BY p.tipo_servicio
            ORDER BY cantidad_vendida DESC
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// INICIO DE SERVIDOR (LOCAL Y PRODUCCIÓN)
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor Aloria PMS escuchando en puerto ${PORT}`);
    console.log(`Acceso local: http://localhost:${PORT}`);
});