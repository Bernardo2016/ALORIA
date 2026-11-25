// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
const state = {
    rol: null,
    usuarioNombre: '',
    habitaciones: [],
    habitacionesDisponibles: [],
    paquetes: [],
    reservaciones: [],
    nominas: [],
    tabuladorNomina: [],
    filtroHabEstado: 'Todas',
    filtroHabTexto: '',
    filtroResEstado: 'Todas',
    filtroResTexto: '',
    charts: {
        ocupacion: null,
        finanzas: null,
        paquetes: null
    },
    calendar: null,
    reservaSeleccionada: null,
    checkInHabTarifa: 0
};

// ==========================================
// UTILIDADES
// ==========================================
function formatMXN(value) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}

function toLocalISODate(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDaysISO(isoDate, days) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return toLocalISODate(dt);
}

function diffDaysISO(startISO, endISO) {
    if (!startISO || !endISO) return 0;
    const [sy, sm, sd] = startISO.split('-').map(Number);
    const [ey, em, ed] = endISO.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function mostrarToast(mensaje, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `<span>${escapeHtml(mensaje)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.25s ease';
        setTimeout(() => toast.remove(), 260);
    }, 3800);
}

function badgeEstadoHabitacion(estado) {
    const map = {
        'Disponible': 'badge-disponible',
        'Ocupada': 'badge-ocupada',
        'En Limpieza': 'badge-limpieza',
        'Mantenimiento': 'badge-mantenimiento'
    };
    return `<span class="badge ${map[estado] || 'badge-mantenimiento'}">${escapeHtml(estado)}</span>`;
}

function badgeEstadoReserva(estado) {
    const map = {
        'Confirmada': 'badge-confirmada',
        'En curso': 'badge-en-curso',
        'Finalizada': 'badge-finalizada',
        'Cancelada': 'badge-cancelada'
    };
    return `<span class="badge ${map[estado] || 'badge-finalizada'}">${escapeHtml(estado)}</span>`;
}

function abrirModal(id) {
    document.getElementById(id).classList.remove('oculto');
}

function cerrarModal(id) {
    document.getElementById(id).classList.add('oculto');
}

// ==========================================
// 1. AUTENTICACIÓN Y NAVEGACIÓN POR ROLES
// ==========================================
document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = document.getElementById('loginCorreo').value.trim();
    const password = document.getElementById('loginPassword').value;
    const msgBox = document.getElementById('mensajeLogin');
    const btn = document.getElementById('btnLogin');

    msgBox.classList.add('oculto');
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo, password })
        });
        const data = await res.json();

        if (!res.ok) {
            msgBox.textContent = data.error || 'Credenciales inválidas';
            msgBox.classList.remove('oculto');
            return;
        }

        iniciarSesionUI(data);
    } catch (err) {
        console.error('Error en login:', err);
        msgBox.textContent = 'Error de conexión con el servidor.';
        msgBox.classList.remove('oculto');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Ingresar al Sistema';
    }
});

async function iniciarSesionUI(data) {
    state.rol = data.rol;
    const nombreCompleto = [data.nombre, data.apellido].filter(Boolean).join(' ') || data.rol;
    state.usuarioNombre = nombreCompleto;

    document.getElementById('seccionLogin').classList.add('oculto');
    document.getElementById('contenedorPrincipal').classList.remove('oculto');

    const iniciales = nombreCompleto
        .split(' ')
        .map(p => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    document.getElementById('avatarIniciales').textContent = iniciales || 'AL';
    document.getElementById('nombreUsuarioSidebar').textContent = nombreCompleto;
    document.getElementById('rolUsuarioSidebar').textContent = data.rol;
    document.getElementById('fechaActualChip').textContent = new Date().toLocaleDateString('es-MX', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    // Resetear visibilidad de navegación
    ['navGerencia', 'navRecepcion', 'navCalendario', 'navRRHH', 'btnNuevaReservaTop'].forEach(id => {
        document.getElementById(id).classList.add('oculto');
    });

    if (data.rol === 'Gerencia') {
        document.getElementById('navGerencia').classList.remove('oculto');
        document.getElementById('navRecepcion').classList.remove('oculto');
        document.getElementById('navCalendario').classList.remove('oculto');
        document.getElementById('navRRHH').classList.remove('oculto');
        document.getElementById('btnNuevaReservaTop').classList.remove('oculto');

        cambiarVista('vistaGerencia');
        await Promise.all([cargarGraficos(), cargarHabitaciones(), cargarPaquetes(), cargarReservaciones(), cargarNominas()]);
    } else if (data.rol === 'Recepcion') {
        document.getElementById('navRecepcion').classList.remove('oculto');
        document.getElementById('navCalendario').classList.remove('oculto');
        document.getElementById('btnNuevaReservaTop').classList.remove('oculto');

        cambiarVista('vistaRecepcion');
        await Promise.all([cargarHabitaciones(), cargarPaquetes(), cargarReservaciones()]);
    } else if (data.rol === 'Recursos Humanos') {
        document.getElementById('navRRHH').classList.remove('oculto');

        cambiarVista('vistaRRHH');
        await cargarNominas();
    }
}

function cambiarVista(vistaId) {
    const titulos = {
        vistaGerencia: ['Panel Gerencial', 'Indicadores financieros, ocupación y rendimiento en tiempo real'],
        vistaRecepcion: ['Habitaciones & Front Desk', 'Control operativo de disponibilidad, Check-In y Check-Out'],
        vistaCalendario: ['Calendario de Reservaciones', 'Agenda interactiva de estancias futuras y control de traslapes'],
        vistaRRHH: ['Nóminas & Personal', 'Consulta salarial, edición y registro de colaboradores']
    };

    ['vistaGerencia', 'vistaRecepcion', 'vistaCalendario', 'vistaRRHH'].forEach(id => {
        document.getElementById(id).classList.toggle('oculto', id !== vistaId);
    });

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === vistaId);
    });

    const [titulo, subtitulo] = titulos[vistaId] || ['Panel de Control', 'Hotel Aloria'];
    document.getElementById('tituloVista').textContent = titulo;
    document.getElementById('subtituloVista').textContent = subtitulo;

    // Cerrar menú móvil si estaba abierto
    document.getElementById('sidebar').classList.remove('open');

    if (vistaId === 'vistaCalendario') {
        requestAnimationFrame(() => {
            inicializarOCalendarRender();
        });
    }
}

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => cambiarVista(btn.dataset.view));
});

document.getElementById('btnMenuMovil').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

function cerrarSesion() {
    location.reload();
}

// ==========================================
// 2. RECEPCIÓN: HABITACIONES, CHECK-IN Y CHECK-OUT
// ==========================================
async function cargarHabitaciones() {
    try {
        const res = await fetch('/api/habitaciones');
        if (!res.ok) throw new Error('Error cargando habitaciones');
        state.habitaciones = await res.json();
        actualizarKPIsHabitaciones();
        renderizarTablaHabitaciones();
    } catch (error) {
        console.error(error);
        mostrarToast('No se pudieron cargar las habitaciones', 'error');
    }
}

function actualizarKPIsHabitaciones() {
    const total = state.habitaciones.length;
    const disponibles = state.habitaciones.filter(h => h.estado === 'Disponible').length;
    const ocupadas = state.habitaciones.filter(h => h.estado === 'Ocupada').length;
    const limpiezaMant = state.habitaciones.filter(h => h.estado === 'En Limpieza' || h.estado === 'Mantenimiento').length;

    document.getElementById('kpiHabTotal').textContent = total;
    document.getElementById('kpiHabDisponibles').textContent = disponibles;
    document.getElementById('kpiHabOcupadas').textContent = ocupadas;
    document.getElementById('kpiHabLimpieza').textContent = limpiezaMant;

    // También actualizar KPI gerencial
    document.getElementById('kpiDisponiblesGerencia').textContent = `${disponibles} disp.`;
    document.getElementById('kpiTotalHabitaciones').textContent = `De ${total} habitaciones totales (${ocupadas} ocupadas)`;
}

function renderizarTablaHabitaciones() {
    const tbody = document.querySelector('#tablaHabitaciones tbody');
    const texto = state.filtroHabTexto.toLowerCase();

    const filtradas = state.habitaciones.filter(hab => {
        const matchEstado = state.filtroHabEstado === 'Todas' || hab.estado === state.filtroHabEstado;
        const matchTexto = !texto ||
            String(hab.numero).toLowerCase().includes(texto) ||
            hab.tipo.toLowerCase().includes(texto) ||
            hab.categoria.toLowerCase().includes(texto);
        return matchEstado && matchTexto;
    });

    if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--slate-500); padding: 28px;">No hay habitaciones que coincidan con el filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtradas.map(hab => {
        const esDisponible = hab.estado === 'Disponible';
        const esOcupada = hab.estado === 'Ocupada';
        const esLimpiezaOMant = hab.estado === 'En Limpieza' || hab.estado === 'Mantenimiento';

        return `
            <tr>
                <td><span class="room-number-tag">#${escapeHtml(hab.numero)}</span></td>
                <td>Piso ${escapeHtml(hab.piso)}</td>
                <td>
                    <strong>${escapeHtml(hab.tipo)}</strong>
                    <div style="font-size: 12px; color: var(--slate-500);">${escapeHtml(hab.categoria)}</div>
                </td>
                <td>${badgeEstadoHabitacion(hab.estado)}</td>
                <td class="tabular-nums"><strong>${formatMXN(hab.tarifa_base)}</strong> <span style="color: var(--slate-500); font-size: 12px;">/ noche</span></td>
                <td>
                    <div class="action-group">
                        <button type="button" class="btn btn-success btn-sm"
                            ${esDisponible ? '' : 'disabled'}
                            onclick="abrirModalCheckIn(${hab.id_habitacion})">
                            Check-In
                        </button>
                        <button type="button" class="btn btn-danger btn-sm"
                            ${esOcupada ? '' : 'disabled'}
                            onclick="realizarCheckOut(${hab.id_habitacion})">
                            Check-Out
                        </button>
                        ${esLimpiezaOMant ? `
                            <button type="button" class="btn btn-outline btn-sm"
                                onclick="cambiarEstadoHabitacion(${hab.id_habitacion}, 'Disponible')">
                                Marcar Disponible
                            </button>
                        ` : ''}
                        ${esDisponible ? `
                            <button type="button" class="btn btn-outline btn-sm"
                                onclick="cambiarEstadoHabitacion(${hab.id_habitacion}, 'Mantenimiento')">
                                Mantenimiento
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

document.querySelectorAll('#filtrosHabitaciones .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('#filtrosHabitaciones .filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.filtroHabEstado = pill.dataset.estado;
        renderizarTablaHabitaciones();
    });
});

document.getElementById('buscarHabitacion').addEventListener('input', (e) => {
    state.filtroHabTexto = e.target.value;
    renderizarTablaHabitaciones();
});

async function cambiarEstadoHabitacion(id_habitacion, estado) {
    try {
        const res = await fetch(`/api/habitaciones/${id_habitacion}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado })
        });
        const data = await res.json();
        if (!res.ok) {
            mostrarToast(data.error || 'No se pudo actualizar el estado', 'error');
            return;
        }
        mostrarToast(data.message, 'success');
        await refrescarDatosOperativos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error de red al cambiar estado', 'error');
    }
}

// ==========================================
// 3. WALK-IN CHECK-IN Y CHECK-OUT
// ==========================================
function abrirModalCheckIn(id_habitacion) {
    const hab = state.habitaciones.find(h => h.id_habitacion === id_habitacion);
    if (!hab) return;

    const hoy = toLocalISODate();
    const manana = addDaysISO(hoy, 1);

    state.checkInHabTarifa = Number(hab.tarifa_base);
    document.getElementById('formCheckIn').reset();
    document.getElementById('habSeleccionada').value = hab.id_habitacion;
    document.getElementById('habDisplayCheckIn').value = `Habitación #${hab.numero} — ${hab.tipo} (${hab.categoria}) · ${formatMXN(hab.tarifa_base)}/noche`;
    document.getElementById('fechaFinCheckIn').min = manana;
    document.getElementById('fechaFinCheckIn').value = manana;
    document.getElementById('numHuespedesCheckIn').value = 1;
    recalcularCostoCheckIn();
    abrirModal('modalCheckIn');
}

function recalcularCostoCheckIn() {
    const hoy = toLocalISODate();
    const fechaFin = document.getElementById('fechaFinCheckIn').value;
    const noches = Math.max(1, diffDaysISO(hoy, fechaFin));
    const paqueteId = document.getElementById('paqueteCheckIn').value;
    const paquete = state.paquetes.find(p => String(p.id_paquete) === String(paqueteId));
    const precioPaquete = paquete ? Number(paquete.precio) : 0;
    const total = (noches * state.checkInHabTarifa) + precioPaquete;
    document.getElementById('costoSugerido').value = total.toFixed(2);
}

document.getElementById('fechaFinCheckIn').addEventListener('change', recalcularCostoCheckIn);
document.getElementById('paqueteCheckIn').addEventListener('change', recalcularCostoCheckIn);

document.getElementById('formCheckIn').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
        ine: document.getElementById('ineHuesped').value.trim(),
        nombre: document.getElementById('nombreHuesped').value.trim(),
        apellido: document.getElementById('apellidoHuesped').value.trim(),
        telefono: document.getElementById('telefonoHuespedCheckIn').value.trim(),
        id_habitacion: document.getElementById('habSeleccionada').value,
        fecha_fin: document.getElementById('fechaFinCheckIn').value,
        num_huespedes: document.getElementById('numHuespedesCheckIn').value,
        id_paquete: document.getElementById('paqueteCheckIn').value || null,
        costo: document.getElementById('costoSugerido').value
    };

    try {
        const res = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const data = await res.json();

        if (!res.ok) {
            mostrarToast(data.error || 'No se pudo completar el Check-In', 'error');
            return;
        }

        cerrarModal('modalCheckIn');
        mostrarToast('Check-In completado exitosamente', 'success');
        await refrescarDatosOperativos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error de comunicación al procesar Check-In', 'error');
    }
});

async function realizarCheckOut(id_habitacion) {
    if (!confirm('¿Confirmas procesar el Check-Out para esta habitación?')) return;

    try {
        const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_habitacion })
        });
        const data = await res.json();

        if (!res.ok) {
            mostrarToast(data.error || 'No se pudo completar el Check-Out', 'error');
            return;
        }

        cerrarModal('modalDetalleReserva');
        mostrarToast(data.message || 'Check-Out completado exitosamente', 'success');
        await refrescarDatosOperativos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error de comunicación al procesar Check-Out', 'error');
    }
}

// ==========================================
// 4. PAQUETES, RESERVACIONES Y CALENDARIO INTERACTIVO
// ==========================================
async function cargarPaquetes() {
    try {
        const res = await fetch('/api/paquetes');
        if (!res.ok) return;
        state.paquetes = await res.json();

        const opciones = state.paquetes.map(p =>
            `<option value="${p.id_paquete}">${escapeHtml(p.tipo_servicio)} (+${formatMXN(p.precio)})</option>`
        ).join('');

        document.getElementById('resPaquete').innerHTML = `<option value="">Sin paquete ($0.00)</option>${opciones}`;
        document.getElementById('paqueteCheckIn').innerHTML = `<option value="">Sin paquete adicional</option>${opciones}`;
    } catch (error) {
        console.error('Error cargando paquetes:', error);
    }
}

async function cargarReservaciones() {
    try {
        const res = await fetch('/api/reservaciones');
        if (!res.ok) throw new Error('Error cargando reservaciones');
        state.reservaciones = await res.json();
        renderizarTablaReservaciones();
        actualizarEventosCalendario();
    } catch (error) {
        console.error(error);
        mostrarToast('No se pudieron cargar las reservaciones', 'error');
    }
}

function inicializarOCalendarRender() {
    const calendarEl = document.getElementById('calendarioReservaciones');
    if (!calendarEl) return;

    if (!state.calendar) {
        state.calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'es',
            height: 'auto',
            selectable: true,
            selectMirror: true,
            dayMaxEvents: 3,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listMonth'
            },
            buttonText: {
                today: 'Hoy',
                month: 'Mes',
                week: 'Semana',
                list: 'Agenda'
            },
            allDayText: 'Estancia',
            noEventsText: 'Sin reservaciones registradas en este periodo',
            select: function (info) {
                abrirModalNuevaReserva(info.startStr, info.endStr);
                state.calendar.unselect();
            },
            eventClick: function (info) {
                const reserva = info.event.extendedProps.reserva;
                if (reserva) abrirModalDetalleReserva(reserva);
            },
            events: mapearEventosCalendario()
        });
        state.calendar.render();
    } else {
        actualizarEventosCalendario();
        state.calendar.updateSize();
    }
}

function mapearEventosCalendario() {
    const colorPorEstado = {
        'Confirmada': '#4f46e5',
        'En curso': '#059669',
        'Finalizada': '#64748b',
        'Cancelada': '#e11d48'
    };

    return state.reservaciones.map(r => ({
        id: String(r.id_reservacion),
        title: `Hab ${r.numero_habitacion} · ${r.nombre_huesped} ${r.apellido_huesped}`,
        start: r.fecha_inicio,
        end: r.fecha_fin,
        allDay: true,
        backgroundColor: colorPorEstado[r.estado] || '#334155',
        borderColor: colorPorEstado[r.estado] || '#334155',
        textColor: '#ffffff',
        extendedProps: { reserva: r }
    }));
}

function actualizarEventosCalendario() {
    if (!state.calendar) return;
    state.calendar.removeAllEvents();
    state.calendar.addEventSource(mapearEventosCalendario());
}

function renderizarTablaReservaciones() {
    const tbody = document.querySelector('#tablaReservaciones tbody');
    const texto = state.filtroResTexto.toLowerCase();

    const filtradas = state.reservaciones.filter(r => {
        const matchEstado = state.filtroResEstado === 'Todas' || r.estado === state.filtroResEstado;
        const matchTexto = !texto ||
            `${r.nombre_huesped} ${r.apellido_huesped}`.toLowerCase().includes(texto) ||
            r.ine.toLowerCase().includes(texto) ||
            String(r.numero_habitacion).toLowerCase().includes(texto);
        return matchEstado && matchTexto;
    });

    if (filtradas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--slate-500); padding: 28px;">No hay reservaciones que coincidan con el filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtradas.map(r => `
        <tr>
            <td class="tabular-nums"><strong>#${r.id_reservacion}</strong></td>
            <td>
                <strong>${escapeHtml(r.nombre_huesped)} ${escapeHtml(r.apellido_huesped)}</strong>
                <div style="font-size: 12px; color: var(--slate-500);">${escapeHtml(r.ine)} · ${r.num_huespedes} huésp.</div>
            </td>
            <td>
                <span class="room-number-tag">#${escapeHtml(r.numero_habitacion)}</span>
                <div style="font-size: 12px; color: var(--slate-500); margin-top: 3px;">${escapeHtml(r.categoria_habitacion)}</div>
            </td>
            <td class="tabular-nums">
                <div><strong>${escapeHtml(r.fecha_inicio)}</strong></div>
                <div style="font-size: 12px; color: var(--slate-500);">al ${escapeHtml(r.fecha_fin)}</div>
            </td>
            <td>${r.paquete ? escapeHtml(r.paquete) : '<span style="color: var(--slate-400);">Ninguno</span>'}</td>
            <td class="tabular-nums"><strong>${formatMXN(r.total_estimado)}</strong></td>
            <td>${badgeEstadoReserva(r.estado)}</td>
            <td>
                <div class="action-group">
                    ${r.estado === 'Confirmada' ? `
                        <button type="button" class="btn btn-success btn-sm" onclick="checkInReservacion(${r.id_reservacion})">
                            Check-In
                        </button>
                        <button type="button" class="btn btn-outline btn-sm" onclick="cancelarReservacion(${r.id_reservacion})">
                            Cancelar
                        </button>
                    ` : ''}
                    ${r.estado === 'En curso' ? `
                        <button type="button" class="btn btn-danger btn-sm" onclick="realizarCheckOut(${r.id_habitacion})">
                            Check-Out
                        </button>
                    ` : ''}
                    <button type="button" class="btn btn-outline btn-sm" onclick="abrirDetallePorId(${r.id_reservacion})">
                        Ver
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

document.querySelectorAll('#filtrosReservaciones .filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('#filtrosReservaciones .filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.filtroResEstado = pill.dataset.estado;
        renderizarTablaReservaciones();
    });
});

document.getElementById('buscarReservacion').addEventListener('input', (e) => {
    state.filtroResTexto = e.target.value;
    renderizarTablaReservaciones();
});

// Modal: Nueva Reservación con filtro automático de disponibilidad
async function abrirModalNuevaReserva(fechaInicioParam, fechaFinParam) {
    document.getElementById('formNuevaReserva').reset();
    document.getElementById('errorNuevaReserva').classList.add('oculto');

    const hoy = toLocalISODate();
    const inicio = fechaInicioParam ? fechaInicioParam.slice(0, 10) : hoy;
    let fin = fechaFinParam ? fechaFinParam.slice(0, 10) : addDaysISO(inicio, 1);
    if (fin <= inicio) fin = addDaysISO(inicio, 1);

    document.getElementById('resFechaInicio').value = inicio;
    document.getElementById('resFechaFin').value = fin;
    document.getElementById('resNumHuespedes').value = 2;

    abrirModal('modalNuevaReserva');
    await cargarHabitacionesDisponiblesPorRango();
}

async function cargarHabitacionesDisponiblesPorRango() {
    const inicio = document.getElementById('resFechaInicio').value;
    const fin = document.getElementById('resFechaFin').value;
    const selectHab = document.getElementById('resHabitacion');
    const hint = document.getElementById('resDisponibilidadHint');

    if (!inicio || !fin || fin <= inicio) {
        state.habitacionesDisponibles = [];
        selectHab.innerHTML = '<option value="">La fecha de salida debe ser posterior a la entrada</option>';
        hint.textContent = 'Ajusta el rango de fechas para consultar habitaciones libres.';
        actualizarCalculoReserva();
        return;
    }

    selectHab.innerHTML = '<option value="">Consultando disponibilidad...</option>';
    try {
        const params = new URLSearchParams({ fecha_inicio: inicio, fecha_fin: fin });
        const res = await fetch(`/api/habitaciones/disponibles?${params.toString()}`);
        const data = await res.json();

        if (!res.ok) {
            selectHab.innerHTML = `<option value="">${escapeHtml(data.error || 'Error consultando')}</option>`;
            hint.textContent = '';
            return;
        }

        state.habitacionesDisponibles = data;
        if (data.length === 0) {
            selectHab.innerHTML = '<option value="">Sin habitaciones disponibles en estas fechas</option>';
            hint.textContent = 'Todas las habitaciones están ocupadas o reservadas en ese periodo.';
        } else {
            selectHab.innerHTML = data.map(h =>
                `<option value="${h.id_habitacion}">Hab #${escapeHtml(h.numero)} — ${escapeHtml(h.tipo)} ${escapeHtml(h.categoria)} (${formatMXN(h.tarifa_base)}/noche)</option>`
            ).join('');
            hint.textContent = `${data.length} habitación(es) disponible(s) sin empalmes entre ${inicio} y ${fin}.`;
        }
        actualizarCalculoReserva();
    } catch (error) {
        console.error(error);
        selectHab.innerHTML = '<option value="">Error de conexión</option>';
    }
}

function actualizarCalculoReserva() {
    const inicio = document.getElementById('resFechaInicio').value;
    const fin = document.getElementById('resFechaFin').value;
    const idHab = document.getElementById('resHabitacion').value;
    const idPaq = document.getElementById('resPaquete').value;

    const noches = diffDaysISO(inicio, fin);
    const hab = state.habitacionesDisponibles.find(h => String(h.id_habitacion) === String(idHab));
    const paq = state.paquetes.find(p => String(p.id_paquete) === String(idPaq));

    if (!hab || noches <= 0) {
        document.getElementById('resResumenCalculo').textContent = 'Selecciona un rango válido y una habitación disponible';
        document.getElementById('resTotalEstimado').textContent = '$0.00';
        return;
    }

    const subtotalHab = noches * Number(hab.tarifa_base);
    const precioPaq = paq ? Number(paq.precio) : 0;
    const total = subtotalHab + precioPaq;

    document.getElementById('resResumenCalculo').textContent =
        `${noches} noche(s) × ${formatMXN(hab.tarifa_base)}` + (paq ? ` + ${paq.tipo_servicio} (${formatMXN(precioPaq)})` : '');
    document.getElementById('resTotalEstimado').textContent = formatMXN(total);
}

document.getElementById('resFechaInicio').addEventListener('change', cargarHabitacionesDisponiblesPorRango);
document.getElementById('resFechaFin').addEventListener('change', cargarHabitacionesDisponiblesPorRango);
document.getElementById('resHabitacion').addEventListener('change', actualizarCalculoReserva);
document.getElementById('resPaquete').addEventListener('change', actualizarCalculoReserva);

document.getElementById('formNuevaReserva').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('errorNuevaReserva');
    const btn = document.getElementById('btnGuardarReserva');
    errBox.classList.add('oculto');

    const payload = {
        fecha_inicio: document.getElementById('resFechaInicio').value,
        fecha_fin: document.getElementById('resFechaFin').value,
        num_huespedes: Number(document.getElementById('resNumHuespedes').value),
        id_paquete: document.getElementById('resPaquete').value || null,
        id_habitacion: document.getElementById('resHabitacion').value,
        ine: document.getElementById('resIne').value.trim(),
        nombre: document.getElementById('resNombre').value.trim(),
        apellido: document.getElementById('resApellido').value.trim(),
        telefono: document.getElementById('resTelefono').value.trim()
    };

    if (!payload.id_habitacion) {
        errBox.textContent = 'Debes seleccionar una habitación disponible.';
        errBox.classList.remove('oculto');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Agendando...';

    try {
        const res = await fetch('/api/reservaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) {
            errBox.textContent = data.error || 'No se pudo agendar la reservación';
            errBox.classList.remove('oculto');
            return;
        }

        cerrarModal('modalNuevaReserva');
        mostrarToast(`Reservación #${data.id_reservacion} agendada con éxito`, 'success');
        await refrescarDatosOperativos();
    } catch (error) {
        console.error(error);
        errBox.textContent = 'Error de comunicación con el servidor.';
        errBox.classList.remove('oculto');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Agendar Reservación';
    }
});

// Detalle y acciones sobre reservación
function abrirDetallePorId(id_reservacion) {
    const reserva = state.reservaciones.find(r => r.id_reservacion === id_reservacion);
    if (reserva) abrirModalDetalleReserva(reserva);
}

function abrirModalDetalleReserva(reserva) {
    state.reservaSeleccionada = reserva;
    document.getElementById('detTitulo').textContent = `Reservación #${reserva.id_reservacion}`;
    document.getElementById('detEstadoBadge').outerHTML = `<span id="detEstadoBadge" class="badge ${
        reserva.estado === 'Confirmada' ? 'badge-confirmada' :
        reserva.estado === 'En curso' ? 'badge-en-curso' :
        reserva.estado === 'Cancelada' ? 'badge-cancelada' : 'badge-finalizada'
    }">${escapeHtml(reserva.estado)}</span>`;
    document.getElementById('detTotal').textContent = formatMXN(reserva.total_estimado);

    document.getElementById('detGrid').innerHTML = `
        <div class="detail-item">
            <span>Huésped</span>
            <strong>${escapeHtml(reserva.nombre_huesped)} ${escapeHtml(reserva.apellido_huesped)}</strong>
        </div>
        <div class="detail-item">
            <span>INE / Teléfono</span>
            <strong>${escapeHtml(reserva.ine)}${reserva.telefono_huesped ? ` · ${escapeHtml(reserva.telefono_huesped)}` : ''}</strong>
        </div>
        <div class="detail-item">
            <span>Habitación</span>
            <strong>#${escapeHtml(reserva.numero_habitacion)} — ${escapeHtml(reserva.tipo_habitacion)} (${escapeHtml(reserva.categoria_habitacion)})</strong>
        </div>
        <div class="detail-item">
            <span>Huéspedes / Paquete</span>
            <strong>${reserva.num_huespedes} persona(s) · ${reserva.paquete ? escapeHtml(reserva.paquete) : 'Sin paquete'}</strong>
        </div>
        <div class="detail-item">
            <span>Fecha de Entrada</span>
            <strong class="tabular-nums">${escapeHtml(reserva.fecha_inicio)}</strong>
        </div>
        <div class="detail-item">
            <span>Fecha de Salida</span>
            <strong class="tabular-nums">${escapeHtml(reserva.fecha_fin)}</strong>
        </div>
    `;

    const btnCheckIn = document.getElementById('btnCheckInReserva');
    const btnCancelar = document.getElementById('btnCancelarReserva');
    const btnCheckOut = document.getElementById('btnCheckOutReserva');

    btnCheckIn.classList.toggle('oculto', reserva.estado !== 'Confirmada');
    btnCancelar.classList.toggle('oculto', reserva.estado !== 'Confirmada');
    btnCheckOut.classList.toggle('oculto', reserva.estado !== 'En curso');

    btnCheckIn.onclick = () => checkInReservacion(reserva.id_reservacion);
    btnCancelar.onclick = () => cancelarReservacion(reserva.id_reservacion);
    btnCheckOut.onclick = () => realizarCheckOut(reserva.id_habitacion);

    abrirModal('modalDetalleReserva');
}

async function checkInReservacion(id_reservacion) {
    try {
        const res = await fetch(`/api/reservaciones/${id_reservacion}/checkin`, { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
            mostrarToast(data.error || 'No se pudo realizar el Check-In', 'error');
            return;
        }

        cerrarModal('modalDetalleReserva');
        mostrarToast(data.message || 'Check-In realizado con éxito', 'success');
        await refrescarDatosOperativos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error de comunicación al realizar Check-In', 'error');
    }
}

async function cancelarReservacion(id_reservacion) {
    if (!confirm('¿Estás seguro de cancelar esta reservación confirmada?')) return;

    try {
        const res = await fetch(`/api/reservaciones/${id_reservacion}/cancelar`, { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
            mostrarToast(data.error || 'No se pudo cancelar la reservación', 'error');
            return;
        }

        cerrarModal('modalDetalleReserva');
        mostrarToast('Reservación cancelada', 'info');
        await refrescarDatosOperativos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error al cancelar reservación', 'error');
    }
}

async function refrescarDatosOperativos() {
    const tareas = [cargarHabitaciones(), cargarReservaciones()];
    if (state.rol === 'Gerencia') tareas.push(cargarGraficos());
    await Promise.all(tareas);
}

// ==========================================
// 5. RECURSOS HUMANOS (NÓMINAS, ALTAS Y EDICIÓN)
// ==========================================
async function cargarTabuladorNomina() {
    try {
        const res = await fetch('/api/tabulador-nomina');
        if (!res.ok) return;
        state.tabuladorNomina = await res.json();
    } catch (error) {
        console.error('Error cargando tabulador salarial:', error);
    }
}

async function cargarNominas() {
    try {
        const [res] = await Promise.all([
            fetch('/api/nominas'),
            cargarTabuladorNomina()
        ]);
        if (!res.ok) throw new Error('Error al consultar nóminas');
        const nominas = await res.json();
        state.nominas = nominas;

        const totalNomina = nominas.reduce((acc, n) => acc + Number(n.sueldo || 0), 0);
        const rolesUnicos = new Set(nominas.map(n => n.rol)).size;

        document.getElementById('kpiTotalEmpleados').textContent = nominas.length;
        document.getElementById('kpiNominaMensual').textContent = formatMXN(totalNomina);
        document.getElementById('kpiPuestosActivos').textContent = rolesUnicos;

        const tbody = document.querySelector('#tablaNominas tbody');
        tbody.innerHTML = nominas.map(nom => `
            <tr>
                <td class="tabular-nums">#${nom.id_empleado}</td>
                <td><strong>${escapeHtml(nom.nombre)} ${escapeHtml(nom.apellido)}</strong></td>
                <td>${escapeHtml(nom.correo)}</td>
                <td><span class="badge badge-confirmada">${escapeHtml(nom.rol)}</span></td>
                <td class="tabular-nums"><strong>${formatMXN(nom.sueldo)}</strong></td>
                <td>
                    <div class="action-group">
                        <button type="button" class="btn btn-outline btn-sm" onclick="abrirModalEditarEmpleado(${nom.id_empleado})">
                            Editar
                        </button>
                        <button type="button" class="btn btn-danger btn-sm" onclick="eliminarEmpleado(${nom.id_empleado})">
                            Baja
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error cargando nóminas', error);
        mostrarToast('No se pudieron cargar las nóminas', 'error');
    }
}

function abrirModalEditarEmpleado(id_empleado) {
    const emp = state.nominas.find(n => n.id_empleado === id_empleado);
    if (!emp) return;

    document.getElementById('errorEditarEmpleado').classList.add('oculto');
    document.getElementById('tituloModalEditarEmp').textContent = `Editar Colaborador #${emp.id_empleado}`;
    document.getElementById('editEmpId').value = emp.id_empleado;
    document.getElementById('editEmpNombre').value = emp.nombre || '';
    document.getElementById('editEmpApellido').value = emp.apellido || '';
    document.getElementById('editEmpCorreo').value = emp.correo || '';
    document.getElementById('editEmpRol').value = emp.rol || 'Recepcion';
    document.getElementById('editEmpSueldo').value = Number(emp.sueldo || 0).toFixed(2);
    document.getElementById('editEmpPassword').value = '';

    abrirModal('modalEditarEmpleado');
}

// Autocompletar sueldo sugerido al cambiar de rol en el modal de edición
document.getElementById('editEmpRol').addEventListener('change', (e) => {
    const rolSeleccionado = e.target.value;
    const puesto = state.tabuladorNomina.find(t => t.tipo_puesto === rolSeleccionado);
    if (puesto) {
        document.getElementById('editEmpSueldo').value = Number(puesto.sueldo).toFixed(2);
    }
});

document.getElementById('formEditarEmpleado').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('errorEditarEmpleado');
    const btn = document.getElementById('btnGuardarEdicionEmp');
    errBox.classList.add('oculto');

    const id = document.getElementById('editEmpId').value;
    const payload = {
        nombre: document.getElementById('editEmpNombre').value.trim(),
        apellido: document.getElementById('editEmpApellido').value.trim(),
        correo: document.getElementById('editEmpCorreo').value.trim(),
        rol: document.getElementById('editEmpRol').value,
        sueldo: document.getElementById('editEmpSueldo').value,
        password: document.getElementById('editEmpPassword').value
    };

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const res = await fetch(`/api/empleados/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) {
            errBox.textContent = data.error || 'No se pudo actualizar el colaborador';
            errBox.classList.remove('oculto');
            return;
        }

        cerrarModal('modalEditarEmpleado');
        mostrarToast(data.message || 'Colaborador actualizado correctamente', 'success');
        await cargarNominas();
    } catch (error) {
        console.error('Error editando empleado:', error);
        errBox.textContent = 'Error de comunicación con el servidor.';
        errBox.classList.remove('oculto');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Cambios';
    }
});

async function eliminarEmpleado(id_empleado) {
    const emp = state.nominas.find(n => n.id_empleado === id_empleado);
    const nombre = emp ? `${emp.nombre} ${emp.apellido}` : `#${id_empleado}`;
    if (!confirm(`¿Confirmas dar de baja al colaborador ${nombre}?`)) return;

    try {
        const res = await fetch(`/api/empleados/${id_empleado}`, { method: 'DELETE' });
        const data = await res.json();

        if (!res.ok) {
            mostrarToast(data.error || 'No se pudo dar de baja al colaborador', 'error');
            return;
        }

        mostrarToast(data.message || 'Colaborador dado de baja', 'info');
        await cargarNominas();
    } catch (error) {
        console.error('Error eliminando empleado:', error);
        mostrarToast('Error de comunicación al eliminar colaborador', 'error');
    }
}

document.getElementById('formNuevoEmpleado').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
        nombre: document.getElementById('nombreEmp').value.trim(),
        apellido: document.getElementById('apellidoEmp').value.trim(),
        correo: document.getElementById('correoEmp').value.trim(),
        password: document.getElementById('passwordEmp').value,
        rol: document.getElementById('rolEmp').value
    };

    try {
        const res = await fetch('/api/empleados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const data = await res.json();

        if (!res.ok) {
            mostrarToast(data.error || 'Error al registrar trabajador', 'error');
            return;
        }

        mostrarToast('Trabajador registrado exitosamente', 'success');
        document.getElementById('formNuevoEmpleado').reset();
        await cargarNominas();
    } catch (error) {
        console.error(error);
        mostrarToast('Error de comunicación al registrar empleado', 'error');
    }
});

// ==========================================
// 6. GRÁFICAS GERENCIALES (CHART.JS)
// ==========================================
async function cargarGraficos() {
    try {
        const [resOcupacion, resFinanzas, resPaquetes] = await Promise.all([
            fetch('/api/dashboard/ocupacion'),
            fetch('/api/dashboard/finanzas'),
            fetch('/api/dashboard/paquetes')
        ]);

        const dataOcupacion = await resOcupacion.json();
        const dataFinanzas = await resFinanzas.json();
        const dataPaquetes = await resPaquetes.json();

        const ingresos = Number(dataFinanzas.ingresos || 0);
        const costos = Number(dataFinanzas.costos || 0);
        const utilidad = ingresos - costos;

        document.getElementById('kpiIngresos').textContent = formatMXN(ingresos);
        document.getElementById('kpiCostos').textContent = formatMXN(costos);
        document.getElementById('kpiUtilidad').textContent = formatMXN(utilidad);

        const colorEstado = {
            'Disponible': '#059669',
            'Ocupada': '#e11d48',
            'En Limpieza': '#d97706',
            'Mantenimiento': '#64748b'
        };

        if (state.charts.ocupacion) state.charts.ocupacion.destroy();
        state.charts.ocupacion = new Chart(document.getElementById('graficoOcupacion'), {
            type: 'doughnut',
            data: {
                labels: dataOcupacion.map(d => d.estado),
                datasets: [{
                    data: dataOcupacion.map(d => d.cantidad),
                    backgroundColor: dataOcupacion.map(d => colorEstado[d.estado] || '#0f172a'),
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '64%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 14, font: { family: 'Inter', size: 12 } }
                    }
                }
            }
        });

        if (state.charts.finanzas) state.charts.finanzas.destroy();
        state.charts.finanzas = new Chart(document.getElementById('graficoFinanzas'), {
            type: 'bar',
            data: {
                labels: ['Ingresos Estimados', 'Costos Operativos'],
                datasets: [{
                    label: 'Monto (MXN)',
                    data: [ingresos, costos],
                    backgroundColor: ['#0f172a', '#e11d48'],
                    borderRadius: 8,
                    barThickness: 46
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { family: 'Inter', size: 11 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Inter', size: 12, weight: '600' } }
                    }
                }
            }
        });

        if (state.charts.paquetes) state.charts.paquetes.destroy();
        state.charts.paquetes = new Chart(document.getElementById('graficoPaquetes'), {
            type: 'bar',
            data: {
                labels: dataPaquetes.map(p => p.paquete),
                datasets: [{
                    label: 'Reservas contratadas',
                    data: dataPaquetes.map(p => p.cantidad_vendida),
                    backgroundColor: '#c89b3c',
                    borderRadius: 8,
                    barThickness: 38
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { stepSize: 1, font: { family: 'Inter', size: 11 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Inter', size: 11, weight: '600' } }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error cargando datos de las gráficas:', error);
    }
}