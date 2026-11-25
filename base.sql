-- ==========================================================
-- CREACIÓN DE LA BASE DE DATOS Y SELECCIÓN
-- ==========================================================
CREATE DATABASE IF NOT EXISTS hotel_aloria;
USE hotel_aloria;

-- ==========================================================
-- FASE 1: TABLAS CATÁLOGO (Sin dependencias / Llaves Foráneas)
-- ==========================================================

-- 1. Catálogo de Estados de Habitación
CREATE TABLE Estado_Habitacion (
   id_estado INT AUTO_INCREMENT PRIMARY KEY,
   nombre_estado VARCHAR(20) UNIQUE NOT NULL
);

-- 2. Tabla de Nómina (Tabulador salarial)
CREATE TABLE Nomina (
   id_nomina INT AUTO_INCREMENT PRIMARY KEY,
   tipo_puesto VARCHAR(50) NOT NULL,
   sueldo DECIMAL(10,2) NOT NULL
);

-- 3. Tabla de Paquetes (Servicios y promociones)
CREATE TABLE Paquetes (
   id_paquete INT AUTO_INCREMENT PRIMARY KEY,
   tipo_servicio VARCHAR(100) NOT NULL,
   precio DECIMAL(10,2) NOT NULL,
   promocion VARCHAR(100)
);

-- 4. Tabla de Proveedores
CREATE TABLE Proveedores (
   id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
   nombre_empresa VARCHAR(100) NOT NULL,
   tipo_suministro VARCHAR(100) NOT NULL 
);

-- 5. Tabla de Huéspedes
CREATE TABLE Huespedes (
   id_huesped INT AUTO_INCREMENT PRIMARY KEY,
   ine VARCHAR(20) UNIQUE NOT NULL,
   nombre VARCHAR(50) NOT NULL,
   apellido VARCHAR(50) NOT NULL,
   telefono VARCHAR(20)
);

-- ==========================================================
-- FASE 2: TABLAS CON DEPENDENCIAS (Llaves Foráneas y Roles)
-- ==========================================================

-- 6. Tabla de Habitaciones
CREATE TABLE Habitaciones (
   id_habitacion INT AUTO_INCREMENT PRIMARY KEY,
   numero VARCHAR(10) UNIQUE NOT NULL,
   piso INT NOT NULL,
   tipo ENUM('Individual', 'Doble', 'Triple', 'Familiar') NOT NULL,
   categoria ENUM('Estándar', 'Superior', 'Deluxe', 'Junior Suite', 'Suite Presidencial') NOT NULL,
   tarifa_base DECIMAL(10,2) NOT NULL,
   id_estado INT NOT NULL,
   FOREIGN KEY (id_estado) REFERENCES Estado_Habitacion(id_estado)
);

-- 7. Tabla de Empleados (Actualizada con autenticación y roles)
CREATE TABLE Empleados (
   id_empleado INT AUTO_INCREMENT PRIMARY KEY,
   nombre VARCHAR(50) NOT NULL,
   apellido VARCHAR(50) NOT NULL,
   numero_contacto VARCHAR(20),
   correo VARCHAR(100) UNIQUE NOT NULL,
   id_nomina INT NOT NULL,
   password_hash VARCHAR(255) NOT NULL,
   rol ENUM('Gerencia', 'Recepcion', 'Recursos Humanos') NOT NULL DEFAULT 'Recepcion',
   FOREIGN KEY (id_nomina) REFERENCES Nomina(id_nomina)
);

-- 8. Tabla de Costos Operacionales
CREATE TABLE Costos_Operacionales (
   id_costo INT AUTO_INCREMENT PRIMARY KEY,
   id_proveedor INT NOT NULL,
   categoria ENUM('Marketing', 'Servicios', 'Limpieza', 'Mantenimiento', 'Jardinería', 'Nóminas') NOT NULL,
   descripcion TEXT,
   monto DECIMAL(10,2) NOT NULL,
   fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY (id_proveedor) REFERENCES Proveedores(id_proveedor)
);

-- 9. Tabla de Reservaciones (Tabla Transaccional Central)
CREATE TABLE Reservaciones (
   id_reservacion INT AUTO_INCREMENT PRIMARY KEY,
   id_huesped INT NOT NULL,
   id_habitacion INT NOT NULL,
   id_paquete INT, 
   fecha_inicio DATE NOT NULL,
   fecha_fin DATE NOT NULL,
   num_huespedes INT NOT NULL,
   estado ENUM('Confirmada', 'En curso', 'Finalizada', 'Cancelada') DEFAULT 'Confirmada',
   FOREIGN KEY (id_huesped) REFERENCES Huespedes(id_huesped) ON DELETE CASCADE,
   FOREIGN KEY (id_habitacion) REFERENCES Habitaciones(id_habitacion),
   FOREIGN KEY (id_paquete) REFERENCES Paquetes(id_paquete),
   CHECK (fecha_fin > fecha_inicio) 
);

-- ==========================================================
-- FASE 3: INSERCIÓN DE DATOS DE PRUEBA (Mock Data)
-- ==========================================================

-- Catálogos
INSERT INTO Estado_Habitacion (nombre_estado) VALUES ('Disponible'), ('Ocupada'), ('En Limpieza'), ('Mantenimiento');

INSERT INTO Nomina (tipo_puesto, sueldo) VALUES 
('Recepcionista', 12500.00), 
('Gerente General', 45000.00), 
('Jefe de Limpieza', 16000.00);

-- Se ajustaron los precios de los paquetes para generar más ingresos
INSERT INTO Paquetes (tipo_servicio, precio, promocion) VALUES 
('Todo Incluido', 3500.00, '10% descuento en Spa'), 
('Solo Desayuno', 650.00, 'Ninguna'),
('Ejecutivo CDMX', 1500.00, 'Acceso a centro de negocios');

INSERT INTO Proveedores (nombre_empresa, tipo_suministro) VALUES 
('Limpieza Capital CDMX SA de CV', 'Artículos de limpieza'), 
('Comisión Federal de Electricidad (CFE)', 'Servicios (Luz)');

INSERT INTO Huespedes (ine, nombre, apellido, telefono) VALUES 
('INE9876543210', 'Roberto', 'Sánchez', '5511223344'),
('INE1234567891', 'María', 'López', '5599887766'),
('INE5544332211', 'Carlos', 'García', '5510203040'),
('INE6677889900', 'Ana', 'Martínez', '5520304050'),
('INE1122334455', 'Luis', 'Fernández', '5530405060'),
('INE9988776655', 'Sofía', 'Rodríguez', '5540506070'),
('INE4455667788', 'Jorge', 'Pérez', '5550607080'),
('INE2233445566', 'Marta', 'Gómez', '5560708090'),
('INE7788990011', 'Diego', 'López', '5570809000'),
('INE3344556677', 'Valeria', 'Díaz', '5580900010'),
('INE8899001122', 'Alejandro', 'Torres', '5590001120'),
('INE1029384756', 'Camila', 'Ruiz', '5500112230'),
('INE5647382910', 'Miguel', 'Hernández', '5511223340'),
('INE0192837465', 'Lucía', 'Jiménez', '5522334450'),
('INE6574839201', 'Fernando', 'Cruz', '5533445560'),
('INE1357924680', 'Paula', 'Morales', '5544556670'),
('INE0864297531', 'Daniel', 'Ortiz', '5555667780');

-- Se incrementaron significativamente las tarifas base de las habitaciones
INSERT INTO Habitaciones (numero, piso, tipo, categoria, tarifa_base, id_estado) VALUES 
('101', 1, 'Individual', 'Estándar', 2500.00, 1), 
('202', 2, 'Triple', 'Superior', 4500.00, 2),
('501', 5, 'Doble', 'Suite Presidencial', 15000.00, 4),
('102', 1, 'Doble', 'Estándar', 2800.00, 1),
('103', 1, 'Doble', 'Estándar', 2800.00, 2),
('201', 2, 'Individual', 'Superior', 3800.00, 1),
('203', 2, 'Triple', 'Superior', 4800.00, 1),
('301', 3, 'Familiar', 'Deluxe', 6500.00, 2),
('302', 3, 'Familiar', 'Deluxe', 6500.00, 3),
('401', 4, 'Doble', 'Junior Suite', 8500.00, 1),
('402', 4, 'Doble', 'Junior Suite', 8500.00, 1),
('502', 5, 'Familiar', 'Suite Presidencial', 18000.00, 1);

-- Empleados
INSERT INTO Empleados (nombre, apellido, numero_contacto, correo, id_nomina, password_hash, rol) VALUES 
('Admin', 'Gerente', '5599887766', 'gerencia@hotelaloria.mx', 2, '$2b$10$wI/XhGv7Z7O.U0H2N8b4nO2R1K2u1N5T7lV6mP4wM8qT3rI1J8y9a', 'Gerencia'),
('Laura', 'Recepcionista', '5512345678', 'recepcion@hotelaloria.mx', 1, '$2b$10$wI/XhGv7Z7O.U0H2N8b4nO2R1K2u1N5T7lV6mP4wM8qT3rI1J8y9a', 'Recepcion');

-- Costos Operacionales (Se mantienen realistas pero controlados para maximizar utilidad)
INSERT INTO Costos_Operacionales (id_proveedor, categoria, descripcion, monto, fecha_registro) VALUES 
(1, 'Limpieza', 'Compra extraordinaria de blancos y toallas por temporada alta', 15000.00, '2026-07-01 10:00:00'),
(2, 'Servicios', 'Excedente de consumo eléctrico por aire acondicionado', 9500.00, '2026-07-15 12:00:00'),
(1, 'Limpieza', 'Detergentes e insumos industriales (Lote de verano)', 6500.00, '2026-08-05 09:30:00'),
(2, 'Marketing', 'Campaña publicitaria en redes sociales - Vacaciones 2026', 12000.00, '2026-08-10 11:00:00'),
(1, 'Mantenimiento', 'Mantenimiento preventivo de elevadores y calderas', 10000.00, '2026-08-20 14:00:00'),
(2, 'Servicios', 'Refuerzo de ancho de banda de internet para huéspedes', 4000.00, '2026-08-25 16:00:00'),
(2, 'Servicios', 'Pago bimestral de energía eléctrica', 14500.00, '2026-09-01 10:00:00');

-- ==========================================================
-- 4. SATURACIÓN DE RESERVACIONES (Estancias largas para generar altas ganancias)
-- ==========================================================
-- Reservaciones Finalizadas (Generan los ingresos actuales)
INSERT INTO Reservaciones (id_huesped, id_habitacion, id_paquete, fecha_inicio, fecha_fin, num_huespedes, estado) VALUES 
(3, 4, 1, '2026-07-01', '2026-07-15', 2, 'Finalizada'), -- 14 noches * $2800 + $3500
(4, 5, 2, '2026-07-05', '2026-07-16', 3, 'Finalizada'), -- 11 noches * $2800 + $650
(5, 6, NULL, '2026-07-10', '2026-07-22', 1, 'Finalizada'), -- 12 noches * $3800
(6, 7, 3, '2026-07-15', '2026-07-30', 4, 'Finalizada'), -- 15 noches * $4800 + $1500
(7, 8, 1, '2026-07-20', '2026-08-05', 2, 'Finalizada'), -- 16 noches * $6500 + $3500
(8, 9, NULL, '2026-07-25', '2026-08-10', 2, 'Finalizada'), -- 16 noches * $6500
(9, 10, 2, '2026-08-01', '2026-08-15', 3, 'Finalizada'), -- 14 noches * $8500 + $650
(10, 11, 1, '2026-08-05', '2026-08-20', 2, 'Finalizada'), -- 15 noches * $8500 + $3500
(1, 3, 1, '2026-08-10', '2026-08-20', 2, 'Finalizada'), -- 10 noches * $15000 + $3500
(2, 12, 1, '2026-08-12', '2026-08-22', 4, 'Finalizada'); -- 10 noches * $18000 + $3500

-- Cancelaciones
INSERT INTO Reservaciones (id_huesped, id_habitacion, id_paquete, fecha_inicio, fecha_fin, num_huespedes, estado) VALUES 
(11, 4, 1, '2026-08-20', '2026-08-25', 2, 'Cancelada'),
(12, 5, 2, '2026-08-22', '2026-08-26', 4, 'Cancelada');

-- Reservaciones En Curso
INSERT INTO Reservaciones (id_huesped, id_habitacion, id_paquete, fecha_inicio, fecha_fin, num_huespedes, estado) VALUES 
(13, 5, 1, '2026-08-26', '2026-08-30', 2, 'En curso'),
(14, 8, 2, '2026-08-27', '2026-09-02', 4, 'En curso'),
(15, 12, 3, '2026-08-28', '2026-09-05', 1, 'En curso'),
(2, 1, NULL, '2026-08-25', '2026-08-28', 1, 'En curso');

-- Reservaciones Futuras (Confirmadas)
INSERT INTO Reservaciones (id_huesped, id_habitacion, id_paquete, fecha_inicio, fecha_fin, num_huespedes, estado) VALUES 
(3, 4, 1, '2026-09-15', '2026-09-20', 2, 'Confirmada'),
(4, 6, 2, '2026-10-10', '2026-10-15', 3, 'Confirmada'),
(5, 7, NULL, '2026-11-01', '2026-11-05', 2, 'Confirmada'),
(6, 9, 3, '2026-11-18', '2026-11-22', 1, 'Confirmada'),
(7, 10, 1, '2026-12-20', '2026-12-26', 4, 'Confirmada'),
(8, 11, 1, '2026-12-22', '2026-12-28', 2, 'Confirmada'),
(9, 12, 2, '2026-12-24', '2026-12-30', 5, 'Confirmada'),
(1, 2, 1, '2026-09-15', '2026-09-18', 2, 'Confirmada');


-- ==========================================================
-- CONSULTAS DE GERENCIA Y REPORTES FINANCIEROS
-- ==========================================================

-- 1. Utilidad Neta (Ingresos masivos superan fácilmente los gastos)
SELECT 
    (SELECT COALESCE(SUM((DATEDIFF(r.fecha_fin, r.fecha_inicio) * h.tarifa_base) + COALESCE(p.precio, 0)), 0)
     FROM Reservaciones r
     JOIN Habitaciones h ON r.id_habitacion = h.id_habitacion
     LEFT JOIN Paquetes p ON r.id_paquete = p.id_paquete
     WHERE r.estado = 'Finalizada') AS Ingresos_Reales,
     
    (SELECT COALESCE(SUM(monto), 0) FROM Costos_Operacionales) AS Gastos_Operativos,
    
    (SELECT COALESCE(SUM(n.sueldo), 0) 
     FROM Empleados e 
     JOIN Nomina n ON e.id_nomina = n.id_nomina) AS Nomina_Mensual;
     
-- 2. Flujo de ingresos por mes
SELECT 
    DATE_FORMAT(r.fecha_inicio, '%Y-%m') AS mes_operacion,
    COUNT(r.id_reservacion) AS total_reservas,
    SUM((DATEDIFF(r.fecha_fin, r.fecha_inicio) * h.tarifa_base) + COALESCE(p.precio, 0)) AS ingresos_proyectados
FROM Reservaciones r
JOIN Habitaciones h ON r.id_habitacion = h.id_habitacion
LEFT JOIN Paquetes p ON r.id_paquete = p.id_paquete
WHERE r.estado != 'Cancelada'
GROUP BY mes_operacion
ORDER BY mes_operacion DESC;

-- 3. Rendimiento y demanda por categoría de habitación
SELECT 
    h.categoria,
    COUNT(r.id_reservacion) AS total_reservas,
    SUM(DATEDIFF(r.fecha_fin, r.fecha_inicio)) AS noches_vendidas
FROM Habitaciones h
LEFT JOIN Reservaciones r ON h.id_habitacion = r.id_habitacion AND r.estado != 'Cancelada'
GROUP BY h.categoria
ORDER BY noches_vendidas DESC;

-- 4. Mayores gastos operativos
SELECT 
    categoria,
    SUM(monto) AS total_gastado,
    COUNT(id_costo) AS cantidad_transacciones
FROM Costos_Operacionales
GROUP BY categoria
ORDER BY total_gastado DESC;

-- 5. Rentabilidad de paquetes adicionales
SELECT 
    p.tipo_servicio,
    p.promocion,
    COUNT(r.id_reservacion) AS veces_contratado,
    SUM(p.precio) AS ingresos_totales_por_paquete
FROM Paquetes p
JOIN Reservaciones r ON p.id_paquete = r.id_paquete
WHERE r.estado != 'Cancelada'
GROUP BY p.id_paquete
ORDER BY veces_contratado DESC;