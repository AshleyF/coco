; CoCo-only prompt commands. ROM block ABI: Color BASIC 1.3 A004/A006/A008/A00C.
; ROM routines use DP=0, $7C type, $7D length, $7E buffer, $81 error.
; Versioned program-only files; never restore interpreter pointers from tape.
tt_mode equ $4308
tt_named equ $4309
tt_length equ $430a
tt_sum equ $430c
tt_left equ $430e
tt_ptr equ $4310
tt_dest equ $4312
tt_last_line equ $4314
tt_name equ $4320
tt_header equ $4330
tt_meta equ $4340
tt_rom_save equ $4350
tt_block equ $4e00
tt_stage equ $7000
tt_max equ $0e00

        setdp $00
        org $4400
t_tape_command
        pshs cc,d,x,y,u,dp
        tst t_auto_flag
        lbmi tt_not_command
        ldx #t_buffer
tt_leading
        lda ,x+
        cmpa #$a0
        beq tt_leading
        leax -1,x
        ldu #tt_save_word
        jsr tt_match
        beq tt_is_save
        ldx #t_buffer
tt_leading_load
        lda ,x+
        cmpa #$a0
        beq tt_leading_load
        leax -1,x
        ldu #tt_load_word
        jsr tt_match
        lbne tt_not_command
        clr tt_mode
        bra tt_boundary
tt_is_save
        lda #1
        sta tt_mode
tt_boundary
        lda ,x
        cmpa #$df
        beq tt_arguments
        cmpa #$a0
        beq tt_arguments
        cmpa #$a2
        lbne tt_not_command
tt_arguments
        clr tt_named
        ldu #tt_name
        ldy #tt_default_name
        ldb #8
tt_default
        lda ,y+
        sta ,u+
        decb
        bne tt_default
        jsr tt_spaces
        cmpa #$df
        beq tt_begin
        cmpa #$a2
        lbne tt_syntax
        leax 1,x
        inc tt_named
        ldu #tt_name
        ldb #8
tt_blank_name
        lda #32
        sta ,u+
        decb
        bne tt_blank_name
        ldu #tt_name
        clrb
tt_parse_name
        lda ,x+
        cmpa #$a2
        beq tt_name_end
        cmpa #$a0
        lbls tt_syntax
        cmpa #$df
        lbeq tt_syntax
        cmpb #8
        lbhs tt_syntax
        anda #$7f
        sta ,u+
        incb
        bra tt_parse_name
tt_name_end
        tstb
        lbeq tt_syntax
        jsr tt_spaces
        cmpa #$df
        lbne tt_syntax
tt_begin
        clra
        tfr a,dp
        ldx #$70
        ldu #tt_rom_save
        ldb #$26
tt_backup
        lda ,x+
        sta ,u+
        decb
        bne tt_backup
        tst tt_mode
        lbeq tt_load
        lda t_himem+1
        ldb t_himem
        std tt_dest
        lda t_pp+1
        ldb t_pp
        std tt_ptr
        ldd tt_dest
        subd tt_ptr
        cmpd #tt_max
        lbhi tt_size_error
        std tt_length
        jsr tt_checksum
        std tt_sum
        ldx #tt_name
        ldu #tt_header
        ldb #8
tt_copy_name
        lda ,x+
        sta ,u+
        decb
        bne tt_copy_name
        lda #1
        sta ,u+
        ldb #6
tt_header_zero
        clr ,u+
        decb
        bne tt_header_zero
        ldx #tt_magic
        ldu #tt_meta
        ldd ,x
        std ,u
        ldd 2,x
        std 2,u
        ldd tt_length
        std 4,u
        ldd tt_sum
        std 6,u
        jsr [$a00c]
        ldx #tt_header
        ldb #15
        clr <$7c
        jsr tt_write
        inc <$7c
        ldx #tt_meta
        ldb #8
        jsr tt_write
        ldd tt_length
        std tt_left
tt_save_next
        ldd tt_left
        beq tt_save_eof
        cmpd #255
        bls tt_save_short
        ldb #255
tt_save_short
        clra
        pshs d
        ldx tt_ptr
        jsr tt_write
        stx tt_ptr
        ldd tt_left
        subd ,s++
        std tt_left
        bra tt_save_next
tt_save_eof
        lda #$ff
        sta <$7c
        clrb
        jsr tt_write
        ldx #tt_saved_msg
        lbra tt_finish
tt_write
        stx <$7e
        stb <$7d
        jsr [$a008]
        rts
tt_match
        pshs x
tt_match_next
        lda ,u+
        beq tt_match_yes
        cmpa ,x+
        beq tt_match_next
        puls x,pc
tt_match_yes
        leas 2,s
        rts
tt_spaces
        lda ,x
        cmpa #$a0
        bne tt_spaces_end
        leax 1,x
        bra tt_spaces
tt_spaces_end
        rts
tt_not_command
        puls cc,d,x,y,u,dp,pc
tt_syntax
        ldx #tt_syntax_msg
        jsr tt_message
        ldu #$4080
        jmp t_warm

tt_load
        jsr [$a004]
        jsr tt_read
        lbne tt_io_error
        tst <$7c
        lbne tt_format_error
        lda <$7d
        cmpa #15
        lbne tt_format_error
        lda tt_block+8
        cmpa #1
        lbne tt_format_error
        ldd tt_block+9
        lbne tt_format_error
        tst tt_named
        beq tt_load_meta
        ldx #tt_name
        ldu #tt_block
        ldb #8
tt_check_name
        lda ,x+
        cmpa ,u+
        lbne tt_name_error
        decb
        bne tt_check_name
tt_load_meta
        jsr tt_read_data
        lbne tt_io_error
        lda <$7d
        cmpa #8
        lbne tt_format_error
        ldx #tt_magic
        ldd ,x
        cmpd tt_block
        lbne tt_format_error
        ldd 2,x
        cmpd tt_block+2
        lbne tt_format_error
        ldd tt_block+4
        cmpd #tt_max
        lbhi tt_size_error
        std tt_length
        std tt_left
        lda t_himem+1
        ldb t_himem
        subd tt_length
        std tt_dest
        lda t_lomem+1
        ldb t_lomem
        cmpd tt_dest
        lbhi tt_size_error
        ldd tt_block+6
        std tt_sum
        ldu #tt_stage
tt_load_next
        ldd tt_left
        beq tt_load_eof
        pshs u
        jsr tt_read_data
        puls u
        lbne tt_io_error
        clra
        ldb <$7d
        lbeq tt_format_error
        cmpd tt_left
        lbhi tt_format_error
        pshs d
        ldx #tt_block
tt_stage_copy
        lda ,x+
        sta ,u+
        decb
        bne tt_stage_copy
        ldd tt_left
        subd ,s++
        std tt_left
        bra tt_load_next
tt_load_eof
        jsr tt_read
        lbne tt_io_error
        lda <$7c
        cmpa #$ff
        lbne tt_format_error
        tst <$7d
        lbne tt_format_error
        ldx #tt_stage
        stx tt_ptr
        jsr tt_checksum
        cmpd tt_sum
        lbne tt_io_error
        ; Validate record bounds, increasing line numbers, and end tokens.
        ldx #tt_stage
        ldd tt_length
        leau d,x
        clr tt_last_line
        clr tt_last_line+1
tt_record
        pshs u
        cmpx ,s++
        beq tt_commit
        ldb ,x
        cmpb #4
        lblo tt_format_error
        clra
        leay d,x
        pshs u
        cmpy ,s++
        lbhi tt_format_error
        lda -1,y
        cmpa #1
        lbne tt_format_error
        lda 2,x
        ldb 1,x
        tsta
        lbmi tt_format_error
        cmpd tt_last_line
        ; Line zero is legal only in the first record.
        bhi tt_line_ok
        cmpx #tt_stage
        lbne tt_format_error
        cmpd #0
        lbne tt_format_error
tt_line_ok
        std tt_last_line
        tfr y,x
        bra tt_record
tt_commit
        ldx #tt_stage
        ldu tt_dest
        ldy tt_length
        beq tt_install
tt_program_copy
        lda ,x+
        sta ,u+
        leay -1,y
        bne tt_program_copy
tt_install
        ldd tt_dest
        stb t_pp
        sta t_pp+1
        clr t_auto_flag
        lda #$40
        tfr a,dp
        ldu #$4080
        jsr t_clr
        clra
        tfr a,dp
        ldx #tt_loaded_msg
        bra tt_finish
tt_read_data
        jsr tt_read
        bne tt_read_done
        lda <$7c
        cmpa #1
tt_read_done
        rts
tt_read
        ldx #tt_block
        stx <$7e
        jsr [$a006]
        tst <$81
        rts
tt_checksum
        ldx tt_ptr
        ldy tt_length
        ldd #0
        leay 0,y
        beq tt_checksum_done
tt_checksum_next
        addb ,x+
        adca #0
        leay -1,y
        bne tt_checksum_next
tt_checksum_done
        rts
tt_io_error
        ldx #tt_io_msg
        bra tt_finish
tt_format_error
        ldx #tt_format_msg
        bra tt_finish
tt_size_error
        ldx #tt_size_msg
        bra tt_finish
tt_name_error
        ldx #tt_name_msg
tt_finish
        pshs x
        ; Stop the motor without CASOFF's interrupt-unmasking side effect.
        lda $ff21
        anda #$f7
        sta $ff21
        ldx #tt_rom_save
        ldu #$70
        ldb #$26
tt_restore
        lda ,x+
        sta ,u+
        decb
        bne tt_restore
        puls x
        jsr tt_message
        lda #$40
        tfr a,dp
        ldu #$4080
        jmp t_warm
tt_message
        lda ,x+
        beq tt_message_done
        jsr t_console_write
        bra tt_message
tt_message_done
        rts
tt_save_word fcb $d3,$c1,$d6,$c5,0
tt_load_word fcb $cc,$cf,$c1,$c4,0
tt_default_name fcc "PROGRAM "
tt_magic fcc "WIB1"
tt_saved_msg fcc "SAVED"
        fcb 13,0
tt_loaded_msg fcc "LOADED"
        fcb 13,0
tt_syntax_msg fcc "TAPE SYNTAX ERR"
        fcb 13,0
tt_io_msg fcc "TAPE I/O ERR"
        fcb 13,0
tt_format_msg fcc "TAPE FORMAT ERR"
        fcb 13,0
tt_size_msg fcc "TAPE TOO LARGE"
        fcb 13,0
tt_name_msg fcc "TAPE NAME ERR"
        fcb 13,0
tt_code_end
        ifgt tt_code_end-$4c00
        error "Tape extension overlaps original grammar"
        endc
