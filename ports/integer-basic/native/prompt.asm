; Apple-1 Integer BASIC -> MC6809E: immediate expression/scalar milestone.
; See native/PORTING.md for source correspondence and current boundaries.
; Requires initialized Color BASIC: KEYIN [$A000], CHROUT [$A002].
; Original structures are LE bytes. Native scratch words labelled *_be are BE.
        org     $3000
start   orcc    #$50
        lds     #$7f00
        jsr     cold
warm    jsr     crout
prompt  lsr     run_flag
        lda     #'>'
        jsr     cout
        ldy     #buffer
read_line
        jsr     rdkey
        cmpa    #8
        bne     echo_key
        lda     #'_'
echo_key jsr     cout
        cmpa    #13
        lbeq    line_done
        cmpa    #'_'
        beq     backspace
        cmpa    #27
        beq     cancel_line
        sta     ,y+
        cmpy    #buffer+128
        blo     read_line
cancel_line
        lda     #'\'
        jsr     cout
        jsr     crout
        ldy     #buffer
        bra     read_line
backspace
        cmpy    #buffer
        beq     cancel_line
        leay    -1,y
        bra     read_line
line_done
        clr     ,y
        jsr     command_line
        tsta
        lbeq    warm
        lbra    prompt

 ; Immediate statement front end; full original tokenization still pending.
statement
        ldx     #buffer
statement_at
        clr     error_code
        jsr     skip_spaces
        lda     ,x
        lbeq    statement_ok
        ldu     #kw_goto
        jsr     keyword
        lbcs    goto_statement
        ldu     #kw_if
        jsr     keyword
        lbcs    if_statement
        ldu     #kw_end
        jsr     keyword
        lbcs    end_statement
        ldu     #kw_tab
        jsr     keyword
        lbcs    tab_statement
        ldu     #print_keyword
        jsr     keyword
        lbcs    print_item
        ldu     #word_clr
        jsr     keyword
        bcs     clear_variables
        ldu     #word_let
        jsr     keyword
        jsr     skip_spaces
        lda     ,x+
        cmpa    #'A'
        lblo    syntax_error
        cmpa    #'Z'
        lbhi    syntax_error
        suba    #'A'
        lsla
        tfr     a,b
        clra
        ldu     #variables
        leau    d,u
        stu     assignment_be
        jsr     skip_spaces
        lda     ,x+
        cmpa    #'='
        lbne    syntax_error
        jsr     parse_or
        std     result_be
        jsr     finish_expression
        tsta
        lbne    statement_return
        tst     validation_mode
        lbne    statement_ok
        ldu     assignment_be
        ldd     result_be
        stb     ,u
        sta     1,u
        lbra    statement_ok
clear_variables
        jsr     skip_spaces
        lda     ,x
        lbne    syntax_error
        tst     validation_mode
        lbne    statement_ok
        jsr     clr_cmd
        lbra    statement_ok
end_statement
        jsr     skip_spaces
        lda     ,x
        lbne    syntax_error
        tst     validation_mode
        lbne    statement_ok
        tst     run_active
        lbeq    syntax_error
        clr     run_active
        lbra    statement_ok
tab_statement
        jsr     parse_or
        std     result_be
        jsr     finish_expression
        tsta
        lbne    statement_return
        tst     validation_mode
        lbne    statement_ok
        ldd     result_be
        tsta
        lbne    statement_ok
        tstb
        lbeq    statement_ok
        decb
        stb     tab_target
spaces_to_target
        ldb     tab_target
        cmpb    column
        lblo    statement_ok
        lda     #' '
        jsr     cout
        bra     spaces_to_target
print_item
        jsr     skip_spaces
        lda     ,x
        lbeq    print_empty
        cmpa    #'"'
        lbeq    parse_string
        jsr     parse_or
        std     result_be
        jsr     finish_print_item
        tsta
        lbne    statement_return
        stx     print_cursor_be
        tst     validation_mode
        lbne    print_separator
        clr     negative
        ldd     result_be
        std     value_be
        bpl     print_magnitude
        inc     negative
        cmpd    #$8000
        beq     print_minimum_error
        ldd     #0
        subd    value_be
        std     value_be
print_magnitude
        jsr     prdec
print_separator
        ldx     print_cursor_be
        lda     ,x
        beq     print_empty
        leax    1,x
        cmpa    #';'
        beq     print_semicolon
        tst     validation_mode
        bne     print_item
        stx     print_cursor_be
        lda     column
        ora     #7
        inca
        sta     tab_target
        jsr     spaces_to_target
        ldx     print_cursor_be
        bra     print_item
print_semicolon
        jsr     skip_spaces
        lda     ,x
        lbeq    statement_ok
        bra     print_item
print_empty
        tst     validation_mode
        bne     statement_ok
        jsr     crout
statement_ok
        clra
statement_return
        rts
print_minimum_error
        lda     #'-'
        jsr     cout
        lbra    range_error
finish_expression
        jsr     check_expression_error
        tsta
        bne     statement_return
        jsr     skip_spaces
        lda     ,x
        lbne    syntax_error
        clra
        rts
finish_print_item
        jsr     check_expression_error
        tsta
        bne     statement_return
        jsr     skip_spaces
        lda     ,x
        beq     statement_ok
        cmpa    #','
        beq     statement_ok
        cmpa    #';'
        beq     statement_ok
        lbra    syntax_error
check_expression_error
        lda     error_code
        cmpa    #2
        lbeq    range_error
        tsta
        lbne    syntax_error
        clra
        rts
parse_string
        leax    1,x
        stx     string_begin_be
find_quote
        lda     ,x+
        lbeq    syntax_error
        cmpa    #'"'
        bne     find_quote
        leau    -1,x
        stu     string_end_be
        jsr     finish_print_item
        tsta
        bne     statement_return
        stx     print_cursor_be
        tst     validation_mode
        lbne    print_separator
        ldx     string_begin_be
emit_literal
        cmpx    string_end_be
        lbeq    print_separator
        lda     ,x+
        jsr     cout
        bra     emit_literal

skip_spaces
        lda     ,x
        cmpa    #' '
        bne     spaces_done
        leax    1,x
        bra     skip_spaces
spaces_done
        rts

; Validate positive magnitude before each decimal digit. The selected original
; also rejects the literal -32768, before applying unary negation.
parse_integer
        clr     negative
        clr     saw_digit
        clr     value_be
        clr     value_be+1
number_digits
        lda     ,x
        cmpa    #'0'
        blo     number_done
        cmpa    #'9'
        bhi     number_done
        suba    #'0'
        sta     digit
        inc     saw_digit
        ldd     value_be
        cmpd    #3276
        lbhi    expr_literal_range
        bne     multiply_ten
        lda     digit
        cmpa    #7
        lbhi    expr_literal_range
multiply_ten
        ldd     value_be
        aslb
        rola
        std     twice_be
        aslb
        rola
        aslb
        rola
        addd    twice_be
        std     value_be
        clra
        ldb     digit
        addd    value_be
        std     value_be
        leax    1,x
        bra     number_digits
number_done
        tst     saw_digit
        lbeq    expr_syntax
        ldd     value_be
        rts

; Native decimal place scan corresponding to reference prdec. D is a normal
; 6809 register word; byte order only matters at the explicit memory boundary.
prdec   ldd     value_be
        beq     positive_value
        tst     negative
        beq     positive_value
        lda     #'-'
        jsr     cout
positive_value
        clr     leading
        ldx     #decimal_places
next_place
        clr     digit
subtract_place
        ldd     value_be
        cmpd    ,x
        blo     place_ready
        subd    ,x
        std     value_be
        inc     digit
        bra     subtract_place
place_ready
        lda     digit
        bne     emit_digit
        tst     leading
        bne     emit_digit
        cmpx    #decimal_places+8
        bne     skip_place
emit_digit
        lda     digit
        adda    #'0'
        jsr     cout
        inc     leading
skip_place
        leax    2,x
        cmpx    #decimal_end
        bne     next_place
        rts
syntax_error
        ldx     #syntax_message
        bra     report_error
range_error
        ldx     #range_message
report_error
        tst     validation_mode
        bne     report_suppressed
        jsr     emit_string
report_suppressed
        lda     #1
        rts
emit_string
        lda     ,x+
        beq     string_done
        jsr     cout
        bra     emit_string
string_done
        rts
        include "expressions.asm"

cold    jsr     program_init
        ldx     #workspace
        ldb     #workspace_end-workspace
clear   clr     ,x+
        decb
        bne     clear
        clr     lomem
        lda     #$40
        sta     lomem+1
        clr     himem
        lda     #$70
        sta     himem+1
new_cmd ldd     himem
        std     pp              ; byte copy preserves original LE layout
clr_cmd ldd     lomem
        std     pv
        clr     for_nest_count
        clr     gosub_nest_count
        clr     synpag
        ldu     #variables
        ldb     #52
clear_scalar
        clr     ,u+
        decb
        bne     clear_scalar
        rts
rdkey   jsr     [$a000]
        beq     rdkey
        cmpa    #'a'
        blo     key_done
        cmpa    #'z'
        bhi     key_done
        suba    #32
key_done
        rts
cout    pshs    a,b,x,y,u
        tst     sink_mode
        beq     cout_console
        ldx     sink_cursor_be
        sta     ,x+
        stx     sink_cursor_be
        puls    a,b,x,y,u,pc
cout_console
        anda    #$7f
        cmpa    #13
        bne     cout_character
        clr     column
cout_character
        inc     column
        jsr     [$a002]
cout_return
        puls    a,b,x,y,u,pc
crout   lda     #13
        bra     cout
print_keyword fcc 'PRINT'
        fcb     0
syntax_message fcc '*** SYNTAX ERR'
        fcb     13,0
range_message fcc '*** >32767 ERR'
        fcb     13,0
decimal_places fdb 10000,1000,100,10,1
decimal_end
workspace
lomem   fdb     0
himem   fdb     0
pp      fdb     0
pv      fdb     0
run_flag fcb    0
for_nest_count fcb 0
gosub_nest_count fcb 0
synpag  fcb     0
negative fcb   0
saw_digit fcb  0
leading fcb    0
digit   fcb    0
value_be fdb   0
twice_be fdb   0
string_begin_be fdb 0
string_end_be fdb 0
error_code fcb 0
comparison fcb 0
math_operator fcb 0
math_negative fcb 0
lhs_be fdb 0
rhs_be fdb 0
product_be fdb 0
result_be fdb 0
assignment_be fdb 0
print_cursor_be fdb 0
tab_target fcb 0
variables equ $4000
workspace_end
buffer  rmb    129
        include "programs.asm"
        end     start
