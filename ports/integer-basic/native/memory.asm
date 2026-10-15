; CoCo LOMEM/HIMEM delimit the dynamic arena; fixed interpreter storage is
; reserved. Program records stay at $5000. HIMEM moves array/string bytes and
; repairs descriptors and active FOR pointers without changing language values.
        org $1c00
lomem_statement
        lda #0
        bra memory_limit_parse
himem_statement
        lda #1
memory_limit_parse
        sta memory_limit_kind
        jsr skip_spaces
        lda ,x+
        cmpa #'='
        lbne syntax_error
        jsr parse_or
        std memory_requested_be
        jsr numeric_type_check
        jsr finish_expression
        tsta
        lbne statement_return
        tst validation_mode
        lbne statement_ok
        ldd memory_requested_be
        cmpd #program_base
        lblt array_range_error
        cmpd #$7000
        lbhi array_range_error
        tst memory_limit_kind
        bne memory_move_high
        cmpd memory_high_be
        lbhs array_range_error
        std memory_low_be
        jsr clr_cmd
        lbra statement_ok
memory_move_high
        ldd storage_top_be
        subd storage_bottom_be
        std memory_used_be
        cmpd memory_requested_be
        lbhs array_range_error
        ldd memory_requested_be
        subd memory_used_be
        cmpd program_end_be
        lbls array_range_error
        cmpd memory_low_be
        lbls array_range_error
        std memory_new_bottom_be
        subd storage_bottom_be
        std memory_delta_be
        pshs x
        ldx storage_bottom_be
        ldu memory_new_bottom_be
        ldy memory_used_be
        cmpy #0
        beq memory_repair
        cmpu storage_bottom_be
        bls memory_forward
        tfr y,d
        leax d,x
        leau d,u
memory_backward
        lda ,-x
        sta ,-u
        leay -1,y
        bne memory_backward
        bra memory_repair
memory_forward
        lda ,x+
        sta ,u+
        leay -1,y
        bne memory_forward
memory_repair
        ldu #descriptor_base
memory_descriptor_loop
        cmpu descriptor_end_be
        beq memory_fix_loops
        ldd 7,u
        jsr memory_adjust_pointer
        std 7,u
        leau 11,u
        bra memory_descriptor_loop
memory_fix_loops
        ldu #for_frames
        ldb for_nest_count
        stb memory_loop_count
memory_loop_frames
        tst memory_loop_count
        beq memory_install
        ldd ,u
        jsr memory_adjust_pointer
        std ,u
        leau 10,u
        dec memory_loop_count
        bra memory_loop_frames
memory_install
        ldd memory_new_bottom_be
        std storage_bottom_be
        ldd memory_requested_be
        std storage_top_be
        std memory_high_be
        puls x
        lbra statement_ok
memory_adjust_pointer
        cmpd storage_bottom_be
        blo memory_pointer_done
        cmpd storage_top_be
        bhs memory_pointer_done
        addd memory_delta_be
memory_pointer_done
        rts

; Apple-1 PLOT is a display placeholder. Preserve its observable byte checks
; and 0..47 second-coordinate range; it does not draw a bitmap in this image.
plot_statement
        jsr parse_or
        jsr numeric_type_check
        pshs d
        jsr skip_spaces
        lda ,x+
        cmpa #','
        bne plot_bad
        jsr parse_or
        std plot_y_be
        jsr numeric_type_check
        puls d
        std plot_x_be
        jsr finish_expression
        tsta
        lbne statement_return
        tst validation_mode
        lbne statement_ok
        ldd plot_x_be
        tsta
        lbne byte_range_error
        ldd plot_y_be
        tsta
        lbne byte_range_error
        cmpb #48
        lbhs array_range_error
        lbra statement_ok
plot_bad
        leas 2,s
        lbra syntax_error
; COLOR= is also an Apple-1 placeholder: consume and check one byte, without
; changing the display. It is a statement, unlike immediate-only memory bounds.
color_statement
        jsr skip_spaces
        lda ,x+
        cmpa #'='
        lbne syntax_error
        jsr parse_or
        jsr numeric_type_check
        std color_value_be
        jsr finish_expression
        tsta
        lbne statement_return
        tst validation_mode
        lbne statement_ok
        ldd color_value_be
        tsta
        lbne byte_range_error
        lbra statement_ok
memory_limit_kind fcb 0
memory_requested_be fdb 0
memory_used_be fdb 0
memory_new_bottom_be fdb 0
memory_delta_be fdb 0
memory_loop_count fcb 0
plot_x_be fdb 0
plot_y_be fdb 0
color_value_be fdb 0
memory_module_end
